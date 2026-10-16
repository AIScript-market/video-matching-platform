/**
 * 검수용 영상 저장소 (S3 호환: Cloudflare R2, AWS S3, 개발용 MinIO). docs/deploy.md 「영상 저장소」.
 * 영상은 브라우저가 서명된 주소로 저장소에 바로 올리고, 관리자도 서명된 주소로 바로 받는다. 우리 서버는 영상 바이트를 다루지 않는다.
 * 환경 변수가 없으면 꺼지고, 제작자는 영상 링크로만 제출한다.
 */
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const VIDEO_STORAGE = Symbol('VIDEO_STORAGE');

/** 한 파일 최대 크기. 숏폼 원본(4K 3분 정도)을 넉넉히 받는다 */
export const VIDEO_MAX_BYTES = 2_000_000_000;
/** 올리기 주소는 1시간, 받기 주소는 30분 동안 쓸 수 있다 */
export const UPLOAD_URL_TTL_SECONDS = 60 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 30 * 60;

/** 받는 영상 형식 (확장자 → Content-Type). 브라우저가 형식을 비워 보내는 경우가 있어 확장자로 정한다 */
export const VIDEO_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
};

export interface PresignedRequest {
  url: string;
  /** 올릴 때 이 헤더를 그대로 보내야 서명이 맞는다 */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface VideoStorage {
  readonly enabled: boolean;
  presignUpload(key: string, contentType: string, sizeBytes: number): Promise<PresignedRequest>;
  presignDownload(key: string, fileName: string, asAttachment: boolean): Promise<PresignedRequest>;
  /** 올라온 파일의 크기. 없으면 null */
  stat(key: string): Promise<{ sizeBytes: number } | null>;
  remove(key: string): Promise<void>;
}

export interface VideoStorageConfig {
  /** API 서버가 저장소에 닿는 주소 */
  endpoint: string;
  /** 브라우저가 닿는 주소 (서명 주소에 들어간다). 없으면 endpoint */
  publicEndpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

export function videoStorageConfig(env: NodeJS.ProcessEnv = process.env): VideoStorageConfig | null {
  const endpoint = env.VIDEO_STORAGE_ENDPOINT?.trim();
  const bucket = env.VIDEO_STORAGE_BUCKET?.trim();
  const accessKeyId = env.VIDEO_STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.VIDEO_STORAGE_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    publicEndpoint: env.VIDEO_STORAGE_PUBLIC_ENDPOINT?.trim() || endpoint,
    bucket,
    region: env.VIDEO_STORAGE_REGION?.trim() || 'auto',
    accessKeyId,
    secretAccessKey,
    forcePathStyle: env.VIDEO_STORAGE_PATH_STYLE === 'true',
  };
}

/** 다운로드 파일 이름 헤더 (한글 이름은 RFC 5987 형식으로) */
export function contentDisposition(fileName: string, asAttachment: boolean): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${asAttachment ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

class S3VideoStorage implements VideoStorage {
  readonly enabled = true;
  private readonly internal: S3Client;
  private readonly signer: S3Client;

  constructor(private readonly config: VideoStorageConfig) {
    const base = {
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      forcePathStyle: config.forcePathStyle,
      // R2는 SDK가 기본으로 붙이는 체크섬 헤더를 서명 주소에서 받지 않는다
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    };
    this.internal = new S3Client({ ...base, endpoint: config.endpoint });
    // 서명은 주소의 호스트까지 포함하므로 브라우저가 닿는 주소로 따로 만든다 (서명은 네트워크를 쓰지 않는다)
    this.signer = config.publicEndpoint === config.endpoint ? this.internal : new S3Client({ ...base, endpoint: config.publicEndpoint });
  }

  async presignUpload(key: string, contentType: string, sizeBytes: number): Promise<PresignedRequest> {
    const cmd = new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType, ContentLength: sizeBytes });
    // 크기와 형식을 서명에 넣어 신고한 것과 다른 파일은 저장소가 거절하게 한다
    const url = await getSignedUrl(this.signer, cmd, { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']) });
    return { url, headers: { 'Content-Type': contentType }, expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000) };
  }

  async presignDownload(key: string, fileName: string, asAttachment: boolean): Promise<PresignedRequest> {
    const cmd = new GetObjectCommand({ Bucket: this.config.bucket, Key: key, ResponseContentDisposition: contentDisposition(fileName, asAttachment) });
    const url = await getSignedUrl(this.signer, cmd, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
    return { url, headers: {}, expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000) };
  }

  async stat(key: string): Promise<{ sizeBytes: number } | null> {
    try {
      const head = await this.internal.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return { sizeBytes: head.ContentLength ?? 0 };
    } catch (e) {
      if (e instanceof S3ServiceException && (e.$metadata.httpStatusCode === 404 || e.name === 'NotFound')) return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.internal.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }
}

class DisabledVideoStorage implements VideoStorage {
  readonly enabled = false;
  private fail(): never {
    throw new Error('영상 저장소가 설정되지 않았습니다 (VIDEO_STORAGE_*)');
  }
  presignUpload(): Promise<PresignedRequest> {
    return this.fail();
  }
  presignDownload(): Promise<PresignedRequest> {
    return this.fail();
  }
  stat(): Promise<{ sizeBytes: number } | null> {
    return this.fail();
  }
  remove(): Promise<void> {
    return this.fail();
  }
}

export function createVideoStorage(env: NodeJS.ProcessEnv = process.env): VideoStorage {
  const config = videoStorageConfig(env);
  return config ? new S3VideoStorage(config) : new DisabledVideoStorage();
}

/** 테스트용: 메모리에 크기만 기록한다. put()으로 브라우저 업로드를 흉내 낸다 */
export class MemoryVideoStorage implements VideoStorage {
  readonly enabled = true;
  readonly objects = new Map<string, number>();
  readonly removed: string[] = [];

  put(key: string, sizeBytes: number) {
    this.objects.set(key, sizeBytes);
  }
  async presignUpload(key: string, contentType: string): Promise<PresignedRequest> {
    return { url: `memory://upload/${key}`, headers: { 'Content-Type': contentType }, expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000) };
  }
  async presignDownload(key: string): Promise<PresignedRequest> {
    return { url: `memory://download/${key}`, headers: {}, expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000) };
  }
  async stat(key: string) {
    const size = this.objects.get(key);
    return size === undefined ? null : { sizeBytes: size };
  }
  async remove(key: string) {
    this.objects.delete(key);
    this.removed.push(key);
  }
}
