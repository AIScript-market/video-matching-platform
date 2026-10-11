import { dateTime, won, type Ledger } from "@/lib/api";

const TYPE_LABEL = { REVENUE: "수익", PAYOUT: "지급", FEE: "수수료", ADJUSTMENT: "조정" } as const;

export function LedgerTable({ ledger }: { ledger: Ledger }) {
  const t = ledger.totals;
  return (
    <div className="stack">
      <div className="row small">
        <span className="badge plain">수익 {won(t.REVENUE)}</span>
        <span className="badge plain">지급 {won(t.PAYOUT)}</span>
        <span className="badge plain">수수료 {won(t.FEE)}</span>
        <span className="badge plain">조정 {won(t.ADJUSTMENT)}</span>
        <span className="badge">미지급 잔액 {won(t.balance)}</span>
      </div>
      {ledger.entries.length === 0 ? (
        <p className="muted small">아직 기록이 없습니다. 장부는 관리자가 기록합니다.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>발생일</th>
                <th>유형</th>
                <th className="num">금액</th>
                <th>메모</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.map((e) => (
                <tr key={e.id}>
                  <td className="small">{dateTime(e.occurredAt)}</td>
                  <td>{TYPE_LABEL[e.type]}</td>
                  <td className="num">{won(e.amountKrw)}</td>
                  <td className="small">{e.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
