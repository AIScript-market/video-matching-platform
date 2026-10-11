import { randomBytes } from 'node:crypto';
import { InMemoryStorage, LikenessVault } from './likeness-vault.js';

describe('LikenessVault', () => {
  const storage = new InMemoryStorage();
  const vault = new LikenessVault(randomBytes(32), storage);

  it('암호문만 저장하고 원본을 그대로 읽어 온다', async () => {
    const plain = Buffer.from('얼굴 스캔 원본');
    const { storageKey, wrappedKey, sha256 } = await vault.store(plain);
    expect(storage.files.get(storageKey)!.includes(plain)).toBe(false);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await vault.read(storageKey, wrappedKey)).equals(plain)).toBe(true);
  });

  it('파일마다 다른 데이터 키를 쓴다', async () => {
    const a = await vault.store(Buffer.from('same'));
    const b = await vault.store(Buffer.from('same'));
    expect(a.wrappedKey).not.toBe(b.wrappedKey);
    expect(storage.files.get(a.storageKey)!.equals(storage.files.get(b.storageKey)!)).toBe(false);
  });

  it('다른 마스터 키나 변조된 파일로는 풀 수 없다', async () => {
    const { storageKey, wrappedKey } = await vault.store(Buffer.from('secret'));
    await expect(new LikenessVault(randomBytes(32), storage).read(storageKey, wrappedKey)).rejects.toThrow();
    const sealed = storage.files.get(storageKey)!;
    sealed[sealed.length - 1] ^= 0xff;
    await expect(vault.read(storageKey, wrappedKey)).rejects.toThrow();
  });

  it('삭제하면 파일이 사라진다', async () => {
    const { storageKey } = await vault.store(Buffer.from('x'));
    await vault.destroy(storageKey);
    expect(storage.files.has(storageKey)).toBe(false);
  });

  it('마스터 키 길이가 틀리면 거절한다', () => {
    expect(() => new LikenessVault(randomBytes(16), storage)).toThrow(/32바이트/);
  });
});
