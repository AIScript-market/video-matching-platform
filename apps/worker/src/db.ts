import pg from 'pg';
import type { AiSummary, ScriptForSummary } from './summary.js';

/**
 * 워커는 API의 Prisma 클라이언트에 의존하지 않고 SQL로 직접 접근한다.
 * 계약상 @@map을 쓰지 않으므로 테이블·컬럼명은 Prisma 모델·필드명과 같다.
 */
export class ScriptRepository {
  constructor(private readonly pool: pg.Pool) {}

  async find(id: string): Promise<ScriptForSummary | null> {
    const { rows } = await this.pool.query<ScriptForSummary>(
      // 요약에는 공개 소개 글만 쓴다. 전문(fullText)·미리보기는 읽지 않는다
      `SELECT "id", "title", "logline", "synopsis", "genre"
         FROM "Script" WHERE "id" = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async saveSummary(id: string, summary: AiSummary): Promise<void> {
    await this.pool.query(`UPDATE "Script" SET "aiSummary" = $2::jsonb WHERE "id" = $1`, [id, JSON.stringify(summary)]);
  }
}
