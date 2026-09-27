import { summarizeRetail } from "../../../lib/sales/workspace";
import type { ManualExpense, SalesOrderRow } from "../../../lib/sales/types";
import styles from "../../../views/admin/SalesWorkspace.module.css";
export function SalesTrend({
  rows,
  expenses,
  currency,
}: {
  rows: SalesOrderRow[];
  expenses: ManualExpense[];
  currency: string;
}) {
  const dates = [
    ...new Set([
      ...rows
        .filter((r) => r.channel === "retail")
        .map((r) => r.date.slice(0, 10)),
      ...expenses.map((e) => e.date),
    ]),
  ].sort();
  const series = dates.map((date) => ({
    date,
    ...summarizeRetail(
      rows.filter((r) => r.date.slice(0, 10) === date),
      expenses.filter((e) => e.date === date),
      currency,
    ),
  }));
  const values = series.flatMap((p) => [
    p.revenue.netRevenue,
    p.costs.totalCosts,
    p.profit.netProfit,
  ]);
  const low = Math.min(0, ...values),
    high = Math.max(1, ...values),
    span = high - low;
  const x = (i: number) => 45 + (i / Math.max(1, series.length - 1)) * 685;
  const y = (v: number) => 190 - ((v - low) / span) * 150;
  const line = (value: (p: (typeof series)[number]) => number) =>
    series.map((p, i) => `${x(i)},${y(value(p))}`).join(" ");
  const money = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2>Sales, costs & profit</h2>
        <span>Retail · {currency}</span>
      </div>
      {!series.length ? (
        <div className={styles.empty}>No financial activity in this range.</div>
      ) : (
        <svg
          viewBox="0 0 760 225"
          role="img"
          aria-label={`Daily retail sales, costs and profit across ${series.length} active days. Exact values are in the table below.`}
          className={styles.chart}
        >
          {[low, low + span / 2, high].map((v, i) => (
            <g key={i}>
              <line x1="45" x2="735" y1={y(v)} y2={y(v)} stroke="#e5e7e4" />
              <text x="2" y={y(v) - 5} fontSize="10" fill="#626d67">
                {Math.round(v)}
              </text>
            </g>
          ))}
          {[
            {
              get: (p: (typeof series)[number]) => p.revenue.netRevenue,
              color: "#a26e29",
            },
            {
              get: (p: (typeof series)[number]) => p.costs.totalCosts,
              color: "#80908a",
            },
            {
              get: (p: (typeof series)[number]) => p.profit.netProfit,
              color: "#236347",
            },
          ].map(({ get, color }) => (
            <g key={color}>
              <polyline
                points={line(get)}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
              />
              {series.map((p, i) => (
                <circle
                  key={p.date}
                  cx={x(i)}
                  cy={y(get(p))}
                  r="3"
                  fill={color}
                >
                  <title>
                    {p.date}: {money(get(p))}
                  </title>
                </circle>
              ))}
            </g>
          ))}
          <text x="45" y="216" fill="#626d67" fontSize="11">
            {dates[0]}
          </text>
          <text x="730" y="216" textAnchor="end" fill="#626d67" fontSize="11">
            {dates[dates.length - 1]}
          </text>
        </svg>
      )}
      <div className={styles.legend}>
        <span>● Net sales</span>
        <span>● Recorded costs</span>
        <span>● Indicative profit</span>
      </div>
      {!!series.length && (
        <details>
          <summary>View daily figures</summary>
          <div
            className={styles.tableFrame}
            role="region"
            aria-label="Daily financial figures"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Sales</th>
                  <th scope="col">Costs</th>
                  <th scope="col">Profit</th>
                </tr>
              </thead>
              <tbody>
                {series.map((p) => (
                  <tr key={p.date}>
                    <td>{p.date}</td>
                    <td>{money(p.revenue.netRevenue)}</td>
                    <td>{money(p.costs.totalCosts)}</td>
                    <td>
                      {p.profit.hasIncompleteProfit
                        ? "Incomplete"
                        : money(p.profit.netProfit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
