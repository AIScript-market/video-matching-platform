import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../core/auth/index.js';
import type { Viewer } from '../access/access-rules.js';
import { OptionalJwtAuthGuard } from './optional-jwt.guard.js';
import {
  CreateScriptDto,
  ListScriptsQueryDto,
  PublishScriptDto,
  ScriptDetailDto,
  ScriptListDto,
  UpdateScriptDto,
} from './dto/script.dto.js';
import { UPLOAD_EXTENSIONS, UPLOAD_MAX_BYTES } from './script-file.js';
import { ScriptsService, type UploadedScriptFile } from './scripts.service.js';

/** multipart/form-data 의 file 필드 하나 */
const FileBody = () =>
  ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } },
  });

function requireFile(file?: UploadedScriptFile): UploadedScriptFile {
  if (!file) throw new BadRequestException('file 필드로 파일을 올려주세요');
  return file;
}

@ApiTags('scripts')
@Controller('scripts')
export class ScriptsController {
  constructor(private readonly scripts: ScriptsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WRITER')
  @ApiBearerAuth()
  @ApiOperation({ summary: '대본 작성 (DRAFT로 생성)' })
  @ApiOkResponse({ type: ScriptDetailDto })
  create(@CurrentUser() user: Viewer, @Body() dto: CreateScriptDto) {
    return this.scripts.create(user, dto);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('WRITER')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @FileBody()
  @ApiOperation({ summary: `파일로 새 대본 초안 만들기 (${UPLOAD_EXTENSIONS.join(', ')}, 최대 5MB)` })
  @ApiOkResponse({ type: ScriptDetailDto })
  upload(@CurrentUser() user: Viewer, @UploadedFile() file?: UploadedScriptFile) {
    return this.scripts.createFromUpload(user, requireFile(file));
  }

  @Post(':id/upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @FileBody()
  @ApiOperation({ summary: '대본 전문을 업로드한 파일 내용으로 바꾸기 (작가 본인)' })
  @ApiOkResponse({ type: ScriptDetailDto })
  replaceUpload(@Param('id') id: string, @CurrentUser() user: Viewer, @UploadedFile() file?: UploadedScriptFile) {
    return this.scripts.replaceFromUpload(id, user, requireFile(file));
  }

  @Post(':id/preview/upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @FileBody()
  @ApiOperation({ summary: '미리보기 대본을 파일로 올리기 (작가 본인). 열람 승인 전 제작자에게 보인다' })
  @ApiOkResponse({ type: ScriptDetailDto })
  uploadPreview(@Param('id') id: string, @CurrentUser() user: Viewer, @UploadedFile() file?: UploadedScriptFile) {
    return this.scripts.uploadPreview(id, user, requireFile(file));
  }

  @Post(':id/summary/refresh')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI 요약 다시 만들기 (작가 본인). 내용이 바뀌면 자동으로도 다시 만든다' })
  @ApiOkResponse({ type: ScriptDetailDto })
  refreshSummary(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.scripts.refreshSummary(id, user);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '공개 대본 목록 (공개 필드만). mine=true면 내 대본 전체' })
  @ApiOkResponse({ type: ScriptListDto })
  list(@Query() query: ListScriptsQueryDto, @CurrentUser() user?: Viewer) {
    return this.scripts.list(query, user ?? null);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: '대본 상세. fullText는 작가·열람 승인된 제작자에게만' })
  @ApiOkResponse({ type: ScriptDetailDto })
  get(@Param('id') id: string, @CurrentUser() user?: Viewer) {
    return this.scripts.get(id, user ?? null);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '대본 수정 (작가 본인)' })
  @ApiOkResponse({ type: ScriptDetailDto })
  update(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: UpdateScriptDto) {
    return this.scripts.update(id, user, dto);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '대본 공개 (rightsDeclared=true 필수). AI 요약 작업을 등록한다' })
  @ApiOkResponse({ type: ScriptDetailDto })
  publish(@Param('id') id: string, @CurrentUser() user: Viewer, @Body() dto: PublishScriptDto) {
    return this.scripts.publish(id, user, dto ?? {});
  }
}
