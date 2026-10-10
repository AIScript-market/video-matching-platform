import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../common/auth';
import type { Viewer } from '../access/access-rules';
import { OptionalJwtAuthGuard } from './optional-jwt.guard';
import {
  CreateScriptDto,
  ListScriptsQueryDto,
  PublishScriptDto,
  ScriptDetailDto,
  ScriptListDto,
  UpdateScriptDto,
} from './dto/script.dto';
import { ScriptsService } from './scripts.service';

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
