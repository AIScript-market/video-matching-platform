import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../../common/auth';
import type { Viewer } from './access-rules';
import { AccessService } from './access.service';
import { AccessRequestDto, CreateAccessRequestDto, ListAccessRequestsQueryDto } from './dto/access.dto';

@ApiTags('access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class AccessController {
  constructor(private readonly access: AccessService) {}

  @Post('scripts/:id/access-requests')
  @Roles('PRODUCER')
  @ApiOperation({ summary: '전문 열람 요청 (제작자, NDA 동의 필수)' })
  @ApiOkResponse({ type: AccessRequestDto })
  request(@Param('id') scriptId: string, @CurrentUser() user: Viewer, @Body() dto: CreateAccessRequestDto) {
    return this.access.request(scriptId, user, dto);
  }

  @Get('access-requests')
  @ApiOperation({ summary: '열람 요청 목록 (내 대본에 들어온 것 + 내가 보낸 것)' })
  @ApiOkResponse({ type: [AccessRequestDto] })
  list(@CurrentUser() user: Viewer, @Query() query: ListAccessRequestsQueryDto) {
    return this.access.list(user, query);
  }

  @Post('access-requests/:id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: '열람 요청 승인 (대본 작가)' })
  @ApiOkResponse({ type: AccessRequestDto })
  approve(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.access.approve(id, user);
  }

  @Post('access-requests/:id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: '열람 요청 거절 (대본 작가)' })
  @ApiOkResponse({ type: AccessRequestDto })
  reject(@Param('id') id: string, @CurrentUser() user: Viewer) {
    return this.access.reject(id, user);
  }
}
