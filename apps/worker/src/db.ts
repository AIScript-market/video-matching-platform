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
      `SELECT "id", "title", "logline", "synopsis", "genre", "fullText", "aiSummaryConsent"
         FROM "Script" WHERE "id" = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * 요약을 저장한다. 요약하는 동안 작가가 동의를 끊었으면 저장하지 않는다 (false).
   * 새 요약은 작가가 읽어 보기 전이므로 비공개로 돌린다.
   */
  async saveSummary(id: string, summary: AiSummary): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `UPDATE "Script" SET "aiSummary" = $2::jsonb, "aiSummaryPublic" = false WHERE "id" = $1 AND "aiSummaryConsent" = true`,
      [id, JSON.stringify(summary)],
    );
    return (rowCount ?? 0) > 0;
  }
}
