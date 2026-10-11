import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../../core/auth/index.js';
import { CreateTakedownDto, CreateWorkDto, DecideTakedownDto, PublishWorkDto, SettleTakedownDto, TakedownDto, WorkDto } from './works.dto.js';
import { WorksService } from './works.service.js';

@ApiTags('works')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class WorksController {
  constructor(private readonly works: WorksService) {}

  @Post('projects/:id/works')
  @ApiOperation({ summary: '작품(회차·숏폼) 등록. 계약 범위 밖 장면 유형이면 거절' })
  @ApiOkResponse({ type: WorkDto })
  create(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateWorkDto) {
    return this.works.create(user, id, dto);
  }

  @Get('projects/:id/works')
  @ApiOperation({ summary: '작품 목록 (기획사)' })
  @ApiOkResponse({ type: [WorkDto] })
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.works.listForProject(user, id);
  }

  @Get('works')
  @ApiOperation({ summary: '내가 출연한 작품 (출연자, 보호자)' })
  @ApiOkResponse({ type: [WorkDto] })
  listMine(@CurrentUser() user: AuthUser) {
    return this.works.listMine(user);
  }

  @Get('works/:id')
  @ApiOperation({ summary: '작품 상세 (기획사, 출연자, 보호자, 관리자)' })
  @ApiOkResponse({ type: WorkDto })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.works.get(user, id);
  }

  @Post('works/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: '출연분 확인 (출연자, 미성년자는 보호자)' })
  @ApiOkResponse({ type: WorkDto })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.works.approve(user, id);
  }

  @Post('works/:id/publish')
  @HttpCode(200)
  @ApiOperation({ summary: '공개 (기획사). 계약·장면 유형·출연분 확인·AI 표시를 모두 통과해야 한다' })
  @ApiOkResponse({ type: WorkDto })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PublishWorkDto) {
    return this.works.publish(user, id, dto);
  }

  @Post('works/:id/takedowns')
  @ApiOperation({ summary: '작품 내림 요청 (출연자, 보호자, 관리자). 계약 위반 사유는 즉시 비공개' })
  @ApiOkResponse({ type: TakedownDto })
  takedown(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateTakedownDto) {
    return this.works.requestTakedown(user, id, dto);
  }

  @Get('takedowns')
  @ApiOperation({ summary: '내림 요청 목록 (관리자는 처리 대기 전체)' })
  @ApiOkResponse({ type: [TakedownDto] })
  listTakedowns(@CurrentUser() user: AuthUser) {
    return this.works.listTakedowns(user);
  }

  @Post('takedowns/:id/settle')
  @HttpCode(200)
  @ApiOperation({ summary: '요청에 합의해 작품을 내림 (기획사)' })
  @ApiOkResponse({ type: TakedownDto })
  settle(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SettleTakedownDto) {
    return this.works.settle(user, id, dto.resolution);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/takedowns')
export class WorksAdminController {
  constructor(private readonly works: WorksService) {}

  @Post(':id/decide')
  @HttpCode(200)
  @ApiOperation({ summary: '내림 요청 판단 (관리자). 인정=삭제, 기각=다시 공개' })
  @ApiOkResponse({ type: TakedownDto })
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideTakedownDto) {
    return this.works.decide(user, id, dto.uphold, dto.resolution);
  }
}
