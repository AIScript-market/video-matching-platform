import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../../core/auth/index.js';
import { PerformanceSnapshotDto, RecordPerformanceDto, TrainingRowDto } from './performance.dto.js';
import { PerformanceService } from './performance.service.js';

@ApiTags('works')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('works/:id/performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Post()
  @ApiOperation({ summary: '작품 성과 기록 (기획사·관리자, 공개한 작품만). 흥행 판단 모델의 정답 데이터' })
  @ApiOkResponse({ type: PerformanceSnapshotDto })
  record(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RecordPerformanceDto) {
    return this.performance.record(user, id, dto);
  }

  @Get()
  @ApiOperation({ summary: '작품 성과 기록 (기획사, 출연자·보호자, 관리자)' })
  @ApiOkResponse({ type: [PerformanceSnapshotDto] })
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.performance.list(user, id);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/ml')
export class TrainingSetController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('training-set')
  @ApiOperation({ summary: '학습용 데이터 (관리자). 학습에 동의한 대본의 메타데이터와 작품 성과. 대본 원문은 포함하지 않는다' })
  @ApiOkResponse({ type: [TrainingRowDto] })
  trainingSet() {
    return this.performance.trainingSet();
  }
}
