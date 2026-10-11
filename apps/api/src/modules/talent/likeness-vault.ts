import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

/** 암호화된 초상 원본이 저장되는 곳. 개발은 로컬 디스크, 운영은 오브젝트 스토리지(S3 등)로 바꾼다 */
export interface LikenessStorage {
  put(key: string, bytes: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const LIKENESS_VAULT = Symbol('LIKENESS_VAULT');

export class LocalDiskStorage implements LikenessStorage {
  constructor(private readonly dir: string) {}

  private file(key: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error('저장 키 형식이 올바르지 않습니다');
    return path.join(this.dir, key);
  }

  async put(key: string, bytes: Buffer) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(key), bytes, { mode: 0o600 });
  }

  get(key: string) {
    return fs.readFile(this.file(key));
  }

  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
}

export class InMemoryStorage implements LikenessStorage {
  readonly files = new Map<string, Buffer>();
  async put(key: string, bytes: Buffer) {
    this.files.set(key, Buffer.from(bytes));
  }
  async get(key: string) {
    const bytes = this.files.get(key);
    if (!bytes) throw new Error('파일이 없습니다');
    return bytes;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

const ALGO = 'aes-256-gcm';

/** iv(12) | tag(16) | 암호문 */
function seal(key: Buffer, plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function open(key: Buffer, sealed: Buffer): Buffer {
  const decipher = createDecipheriv(ALGO, key, sealed.subarray(0, 12));
  decipher.setAuthTag(sealed.subarray(12, 28));
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]);
}

/**
 * 봉투 암호화: 파일마다 무작위 데이터 키를 만들고, 그 키는 마스터 키로 감싼 형태로만 DB에 둔다.
 * 감싼 키를 지우면 백업에 남은 사본까지 모두 읽을 수 없게 된다.
 */
export class LikenessVault {
  constructor(
    private readonly masterKey: Buffer,
    private readonly storage: LikenessStorage,
  ) {
    if (masterKey.length !== 32) throw new Error('초상 마스터 키는 32바이트여야 합니다');
  }

  async store(plain: Buffer): Promise<{ storageKey: string; wrappedKey: string; sha256: string }> {
    const dataKey = randomBytes(32);
    const storageKey = randomBytes(18).toString('base64url');
    await this.storage.put(storageKey, seal(dataKey, plain));
    return {
      storageKey,
      wrappedKey: seal(this.masterKey, dataKey).toString('base64'),
      sha256: createHash('sha256').update(plain).digest('hex'),
    };
  }

  async read(storageKey: string, wrappedKey: string): Promise<Buffer> {
    const dataKey = open(this.masterKey, Buffer.from(wrappedKey, 'base64'));
    return open(dataKey, await this.storage.get(storageKey));
  }

  async destroy(storageKey: string): Promise<void> {
    await this.storage.delete(storageKey);
  }
}

/** 고정된 개발용 키 (재시작해도 로컬 데이터를 읽을 수 있게). 운영에서는 쓰지 않는다 */
export function devMasterKey(): Buffer {
  return createHash('sha256').update('vmp-dev-only-likeness-key').digest();
}

/** 환경 변수로 금고를 만든다. 운영에서 LIKENESS_MASTER_KEY가 없으면 시작하지 않는다 */
export function vaultFromEnv(env: NodeJS.ProcessEnv = process.env): LikenessVault {
  const storage = new LocalDiskStorage(env.LIKENESS_STORAGE_DIR ?? '.likeness-store');
  if (env.LIKENESS_MASTER_KEY) return new LikenessVault(Buffer.from(env.LIKENESS_MASTER_KEY, 'base64'), storage);
  if (env.NODE_ENV === 'production') throw new Error('LIKENESS_MASTER_KEY가 필요합니다');
  return new LikenessVault(devMasterKey(), storage);
}
