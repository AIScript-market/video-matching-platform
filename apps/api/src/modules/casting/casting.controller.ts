import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../../core/auth/index.js';
import {
  AcceptCastingDto,
  ApplyDto,
  CastingContractDto,
  CastingNegotiationDto,
  CastingOfferDto,
  CreateCastingOfferDto,
  CreateProjectDto,
  CreateRoleDto,
  EarlyTerminationQuoteDto,
  GuardianDecisionDto,
  InviteDto,
  ProjectDto,
  RoleDto,
  TerminateContractDto,
} from './casting.dto.js';
import { CastingService } from './casting.service.js';

@ApiTags('casting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CastingController {
  constructor(private readonly casting: CastingService) {}

  @Post('deals/:dealId/project')
  @ApiOperation({ summary: '딜로 작품 만들기 (딜의 작가·제작자 = 기획사). 딜 하나에 작품 하나' })
  @ApiOkResponse({ type: ProjectDto })
  createProject(@CurrentUser() user: AuthUser, @Param('dealId') dealId: string, @Body() dto: CreateProjectDto) {
    return this.casting.createProject(user, dealId, dto);
  }

  @Get('deals/:dealId/project')
  @ApiOperation({ summary: '딜에 연결된 작품 (없으면 null)' })
  @ApiOkResponse({ type: ProjectDto })
  projectForDeal(@CurrentUser() user: AuthUser, @Param('dealId') dealId: string) {
    return this.casting.projectForDeal(user, dealId);
  }

  @Get('projects')
  @ApiOperation({ summary: '내 기획사 작품 (관리자는 전체)' })
  @ApiOkResponse({ type: [ProjectDto] })
  listProjects(@CurrentUser() user: AuthUser) {
    return this.casting.listProjects(user);
  }

  @Get('projects/:id')
  @ApiOperation({ summary: '작품 상세 (기획사 구성원, 관리자)' })
  @ApiOkResponse({ type: ProjectDto })
  getProject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casting.getProject(user, id);
  }

  @Post('projects/:id/roles')
  @ApiOperation({ summary: '배역 등록. 미성년 배역에는 INTIMACY·SUBSTANCE를 붙일 수 없다' })
  @ApiOkResponse({ type: RoleDto })
  createRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateRoleDto) {
    return this.casting.createRole(user, id, dto);
  }

  @Get('projects/:id/roles')
  @ApiOperation({ summary: '작품의 배역' })
  @ApiOkResponse({ type: [RoleDto] })
  listRoles(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casting.listRoles(user, id);
  }

  @Get('casting/roles')
  @ApiOperation({ summary: '공개 오디션: 캐스팅 중인 배역' })
  @ApiOkResponse({ type: [RoleDto] })
  openRoles() {
    return this.casting.openRoles();
  }

  @Post('casting/roles/:roleId/applications')
  @ApiOperation({ summary: '배역에 지원 (출연자). 허용하지 않은 장면 유형이 있는 배역에는 지원할 수 없다' })
  @ApiOkResponse({ type: CastingNegotiationDto })
  apply(@CurrentUser() user: AuthUser, @Param('roleId') roleId: string, @Body() dto: ApplyDto) {
    return this.casting.apply(user, roleId, dto.message);
  }

  @Post('casting/roles/:roleId/invitations')
  @ApiOperation({ summary: '출연자에게 출연 제안 시작 (기획사 구성원)' })
  @ApiOkResponse({ type: CastingNegotiationDto })
  invite(@CurrentUser() user: AuthUser, @Param('roleId') roleId: string, @Body() dto: InviteDto) {
    return this.casting.invite(user, roleId, dto.talentId, dto.message);
  }

  @Get('casting/negotiations')
  @ApiOperation({ summary: '내 캐스팅 협상 (출연자, 보호자, 기획사)' })
  @ApiOkResponse({ type: [CastingNegotiationDto] })
  listNegotiations(@CurrentUser() user: AuthUser) {
    return this.casting.listNegotiations(user);
  }

  @Get('casting/negotiations/:id')
  @ApiOperation({ summary: '캐스팅 협상 상세 + 제안 이력' })
  @ApiOkResponse({ type: CastingNegotiationDto })
  getNegotiation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casting.getNegotiation(user, id);
  }

  @Post('casting/negotiations/:id/offers')
  @ApiOperation({ summary: '출연료 제안 / 역제안 (고정·회당·수익 배분·혼합)' })
  @ApiOkResponse({ type: CastingOfferDto })
  createOffer(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateCastingOfferDto) {
    return this.casting.createOffer(user, id, dto);
  }

  @Post('casting/offers/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: '제안 수락 (상대방). 미성년자는 보호자 승인 후 계약이 된다' })
  @ApiOkResponse({ type: AcceptCastingDto })
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casting.accept(user, id);
  }

  @Post('casting/offers/:id/guardian-decision')
  @HttpCode(200)
  @ApiOperation({ summary: '보호자의 승인·거절' })
  @ApiOkResponse({ type: AcceptCastingDto })
  guardianDecision(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: GuardianDecisionDto) {
    return this.casting.guardianDecision(user, id, dto.approve);
  }

  @Get('casting/contracts')
  @ApiOperation({ summary: '내 출연 계약 (관리자는 전체)' })
  @ApiOkResponse({ type: [CastingContractDto] })
  listContracts(@CurrentUser() user: AuthUser) {
    return this.casting.listContracts(user);
  }

  @Get('casting/contracts/:id')
  @ApiOperation({ summary: '출연 계약 상세' })
  @ApiOkResponse({ type: CastingContractDto })
  getContract(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casting.getContract(user, id);
  }

  @Get('casting/contracts/:id/early-termination-quote')
  @ApiOperation({ summary: '조기 종료 보상액 안내 (출연자·보호자)' })
  @ApiOkResponse({ type: EarlyTerminationQuoteDto })
  quote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.casting.earlyTerminationQuote(user, id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/casting')
export class CastingAdminController {
  constructor(private readonly casting: CastingService) {}

  @Post('contracts/:id/terminate')
  @HttpCode(200)
  @ApiOperation({ summary: '조기 종료 확정 (관리자, 보상 입금 확인 후). 이 계약으로 만든 작품을 내린다' })
  @ApiOkResponse({ type: CastingContractDto })
  terminate(@Param('id') id: string, @Body() dto: TerminateContractDto) {
    return this.casting.terminate(id, dto.reason);
  }
}
