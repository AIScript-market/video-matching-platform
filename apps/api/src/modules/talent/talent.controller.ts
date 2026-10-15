import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../../core/auth/index.js';
import {
  AccessLogEntryDto,
  ConsentDto,
  CreateTalentProfileDto,
  IdentityDto,
  LikenessAssetDto,
  TalentDirectoryQueryDto,
  TalentPublicDto,
  TalentSelfDto,
  UpdateTalentProfileDto,
  UploadAssetDto,
  VerifyIdentityDto,
  WardDto,
} from './talent.dto.js';
import { MAX_ASSET_BYTES, TalentService } from './talent.service.js';

type UploadedBytes = { buffer: Buffer; mimetype: string; size: number };

@ApiTags('talent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TalentController {
  constructor(private readonly talent: TalentService) {}

  @Post('identity-verification')
  @HttpCode(200)
  @ApiOperation({ summary: '본인인증 (출연자, 보호자). 생년월일은 저장하지 않는다' })
  @ApiOkResponse({ type: IdentityDto })
  verifyIdentity(@CurrentUser() user: AuthUser, @Body() dto: VerifyIdentityDto) {
    return this.talent.verifyIdentity(user, dto.token);
  }

  @Get('identity-verification')
  @ApiOperation({ summary: '내 본인인증 결과 (없으면 null)' })
  @ApiOkResponse({ type: IdentityDto })
  identity(@CurrentUser() user: AuthUser) {
    return this.talent.identity(user);
  }

  @Post('talent/profile')
  @ApiOperation({ summary: '출연자로 등록 (배우 또는 일반인). 관리자 계정은 불가' })
  @ApiOkResponse({ type: TalentSelfDto })
  createProfile(@CurrentUser() user: AuthUser, @Body() dto: CreateTalentProfileDto) {
    return this.talent.createProfile(user, dto);
  }

  @Get('talent/me')
  @ApiOperation({ summary: '내 출연자 프로필과 남은 등록 단계 (등록 전이면 null)' })
  @ApiOkResponse({ type: TalentSelfDto })
  me(@CurrentUser() user: AuthUser) {
    return this.talent.meOrNull(user);
  }

  @Patch('talent/me')
  @ApiOperation({ summary: '출연 조건 수정 (허용 장면 유형, 최저 출연료 등)' })
  @ApiOkResponse({ type: TalentSelfDto })
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateTalentProfileDto) {
    return this.talent.updateProfile(user, dto);
  }

  @Post('talent/me/assets')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_ASSET_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['kind', 'file'],
      properties: { kind: { type: 'string', enum: ['FACE_SCAN', 'VOICE', 'MOTION'] }, file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: '얼굴 스캔·음성·동작 원본 업로드. 파일마다 따로 암호화해 저장한다' })
  @ApiOkResponse({ type: LikenessAssetDto })
  upload(@CurrentUser() user: AuthUser, @Body() dto: UploadAssetDto, @UploadedFile() file?: UploadedBytes) {
    return this.talent.uploadAsset(user, dto.kind, file);
  }

  @Delete('talent/me/assets/:assetId')
  @HttpCode(204)
  @ApiOperation({ summary: '원본 하나 삭제 (제작 기한이 남은 계약이 없을 때)' })
  @ApiNoContentResponse()
  deleteAsset(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    return this.talent.deleteAsset(user, assetId);
  }

  @Post('talent/me/liveness')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('selfie', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['selfie'], properties: { selfie: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: '실시간 셀카로 본인 확인 (등록한 얼굴 스캔과 대조)' })
  @ApiOkResponse({ type: TalentSelfDto })
  liveness(@CurrentUser() user: AuthUser, @UploadedFile() selfie?: UploadedBytes) {
    return this.talent.verifyLiveness(user, selfie);
  }

  @Post('talent/me/consent')
  @HttpCode(200)
  @ApiOperation({ summary: '민감정보 처리·국외 처리 동의 (성년이 된 뒤 재동의도 여기서)' })
  @ApiOkResponse({ type: TalentSelfDto })
  consent(@CurrentUser() user: AuthUser, @Body() dto: ConsentDto) {
    return this.talent.consent(user, dto);
  }

  @Get('talent/me/access-logs')
  @ApiOperation({ summary: '내 원본을 누가 언제 내려받았는지' })
  @ApiOkResponse({ type: [AccessLogEntryDto] })
  accessLogs(@CurrentUser() user: AuthUser) {
    return this.talent.accessLogs(user);
  }

  @Post('talent/me/withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: '등록 철회. 새 제안 차단, 7일 숙려 후(진행 중 계약은 제작 기한 후) 원본·모델 삭제' })
  @ApiOkResponse({ type: TalentSelfDto })
  withdraw(@CurrentUser() user: AuthUser) {
    return this.talent.withdraw(user);
  }

  @Post('talent/me/withdraw/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: '철회 취소 (7일 이내)' })
  @ApiOkResponse({ type: TalentSelfDto })
  cancelWithdraw(@CurrentUser() user: AuthUser) {
    return this.talent.cancelWithdrawal(user);
  }

  @Get('talent')
  @ApiOperation({ summary: '캐스팅 목록 (등록을 마친 출연자만, 실명·원본 없음)' })
  @ApiOkResponse({ type: [TalentPublicDto] })
  directory(@Query() query: TalentDirectoryQueryDto) {
    return this.talent.directory(query);
  }

  @Get('talent/:id')
  @ApiOperation({ summary: '출연자 공개 프로필' })
  @ApiOkResponse({ type: TalentPublicDto })
  profile(@Param('id') id: string) {
    return this.talent.publicProfile(id);
  }

  @Get('likeness/assets/:assetId/content')
  @ApiProduces('application/octet-stream')
  @ApiOperation({ summary: '원본 내려받기 (본인, 또는 제작 기한 안의 디지털 출연 계약이 있는 기획사). 매번 기록' })
  async download(@CurrentUser() user: AuthUser, @Param('assetId') assetId: string) {
    const { contentType, bytes } = await this.talent.readAsset(user, assetId);
    return new StreamableFile(bytes, { type: contentType, disposition: 'attachment' });
  }

  @Post('guardian/wards/:talentId/consent')
  @HttpCode(200)
  @ApiOperation({ summary: '법정대리인 동의 (미성년 출연자가 적은 이메일의 계정만)' })
  @ApiOkResponse({ type: WardDto })
  guardianConsent(@CurrentUser() user: AuthUser, @Param('talentId') talentId: string) {
    return this.talent.guardianConsent(user, talentId);
  }

  @Get('guardian/wards')
  @ApiOperation({ summary: '내가 대리하는(또는 대리 요청을 받은) 미성년 출연자' })
  @ApiOkResponse({ type: [WardDto] })
  wards(@CurrentUser() user: AuthUser) {
    return this.talent.wards(user);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/talent')
export class TalentAdminController {
  constructor(private readonly talent: TalentService) {}

  @Get('guardian-checks')
  @ApiOperation({ summary: '보호자 관계 확인 대기 목록 (관리자)' })
  @ApiOkResponse({ type: [WardDto] })
  pending() {
    return this.talent.pendingGuardianChecks();
  }

  @Post(':talentId/guardian-verified')
  @HttpCode(200)
  @ApiOperation({ summary: '보호자 관계 확인 완료 (관리자, 가족관계증명서 확인 후)' })
  @ApiOkResponse({ type: WardDto })
  verifyGuardian(@Param('talentId') talentId: string) {
    return this.talent.verifyGuardianRelationship(talentId);
  }
}
