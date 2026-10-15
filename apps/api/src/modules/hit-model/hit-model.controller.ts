import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../../core/auth/index.js';
import {
  CommentSentimentDto,
  CommentSentimentRequestDto,
  EmbedStaleResultDto,
  HitInsightDto,
  HitModelVersionDto,
  MlStatusDto,
  RecommendationsDto,
  RecommendationsQueryDto,
  TrainRequestDto,
  TrainResultDto,
} from './hit-model.dto.js';
import { HitModelService } from './hit-model.service.js';

@ApiTags('hit-model')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class HitModelController {
  constructor(private readonly hitModel: HitModelService) {}

  @Get('scripts/:id/hit-insight')
  @ApiOperation({ summary: '흥행 판단 (영상 제작자·관리자). 작가 본인에게는 403' })
  @ApiOkResponse({ type: HitInsightDto })
  insight(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.hitModel.insight(user, id);
  }

  @Get('recommendations/scripts')
  @ApiOperation({ summary: '영상 제작자용 대본 추천 (흥행 판단 모델 순서, 자기 대본 제외)' })
  @ApiOkResponse({ type: RecommendationsDto })
  recommendations(@CurrentUser() user: AuthUser, @Query() query: RecommendationsQueryDto) {
    return this.hitModel.recommendations(user, query.limit);
  }

  @Post('ml/comment-sentiment')
  @HttpCode(200)
  @ApiOperation({ summary: '댓글 긍정·부정 개수 세기 (성과 입력 보조). 댓글은 저장하지 않는다' })
  @ApiOkResponse({ type: CommentSentimentDto })
  sentiment(@Body() dto: CommentSentimentRequestDto) {
    return this.hitModel.sentiment(dto.comments);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/ml')
export class HitModelAdminController {
  constructor(private readonly hitModel: HitModelService) {}

  @Get('status')
  @ApiOperation({ summary: '모델 상태: 임베더, 벡터 수, 학습 데이터 수 / 필요한 수, 활성 모델' })
  @ApiOkResponse({ type: MlStatusDto })
  status() {
    return this.hitModel.status();
  }

  @Get('models')
  @ApiOperation({ summary: '학습한 모델 버전 (최근 20개)' })
  @ApiOkResponse({ type: [HitModelVersionDto] })
  models() {
    return this.hitModel.models();
  }

  @Post('train')
  @HttpCode(200)
  @ApiOperation({ summary: '모델 학습. 시간 순서 검증에서 장르 평균 이상일 때만 활성화한다' })
  @ApiOkResponse({ type: TrainResultDto })
  train(@Body() dto: TrainRequestDto) {
    return this.hitModel.train(dto.forceActivate === true);
  }

  @Post('embed-stale')
  @HttpCode(200)
  @ApiOperation({ summary: '벡터가 없거나 본문이 바뀐 대본을 벡터화' })
  @ApiOkResponse({ type: EmbedStaleResultDto })
  embedStale() {
    return this.hitModel.embedStale();
  }
}
