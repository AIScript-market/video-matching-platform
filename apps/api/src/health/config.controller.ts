import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { betaConfig, TERMS_VERSION } from '../core/beta.js';
import { videoStorageConfig } from '../core/video-storage.js';

class FeatureFlagsDto {
  @ApiProperty({ description: '출연자 등록·얼굴 스캔' }) talent!: boolean;
  @ApiProperty({ description: '캐스팅·작품 공개' }) casting!: boolean;
  @ApiProperty({ description: '흥행 판단·추천' }) hitModel!: boolean;
  @ApiProperty({ description: '영상 파일을 저장소에 바로 올릴 수 있는가 (VIDEO_STORAGE_*). 꺼져 있으면 링크로만 제출' }) videoUpload!: boolean;
}

export class PublicConfigDto {
  @ApiProperty({ description: '초대제 비공개 베타' }) betaMode!: boolean;
  @ApiProperty({ description: '가입에 초대 코드와 성인 확인이 필요한가' }) inviteRequired!: boolean;
  @ApiProperty({ description: '코인을 살 수 있는가 (베타에서는 꺼짐)' }) purchaseEnabled!: boolean;
  @ApiProperty({ description: '가입하면 받는 코인' }) signupCoins!: number;
  @ApiProperty({ description: '가입 화면의 약관·처리방침 버전' }) termsVersion!: string;
  @ApiProperty({ nullable: true, type: String, description: '운영자 문의 이메일 (CONTACT_EMAIL)' }) contactEmail!: string | null;
  @ApiProperty({ type: FeatureFlagsDto }) features!: FeatureFlagsDto;
}

/** 웹이 메뉴·가입 화면을 맞추려고 읽는 공개 설정 */
export function publicConfig(): PublicConfigDto {
  const beta = betaConfig();
  const on = !beta.enabled;
  return {
    betaMode: beta.enabled,
    inviteRequired: beta.enabled,
    purchaseEnabled: on,
    signupCoins: beta.enabled ? beta.signupCoins : 10,
    termsVersion: TERMS_VERSION,
    contactEmail: process.env.CONTACT_EMAIL?.trim() || null,
    features: { talent: on, casting: on, hitModel: on, videoUpload: videoStorageConfig() !== null },
  };
}

@ApiTags('config')
@Controller('config')
export class ConfigController {
  @Get()
  @ApiOperation({ summary: '공개 설정 (베타 여부, 켜진 기능, 가입 조건)' })
  @ApiOkResponse({ type: PublicConfigDto })
  get(): PublicConfigDto {
    return publicConfig();
  }
}
