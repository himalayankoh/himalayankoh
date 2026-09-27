"use client";
import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Download,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  ArrowUpRight,
  CircleDollarSign, TrendingUp, Wallet, ShoppingBag,
} from "lucide-react";
import { getFreshAccessToken } from "../../services/wordpressAdminAuth";
import { AdminModal, AdminPageHeader } from "../../components/admin/AdminUI";
import { ICON_TILE, ICON_TILE_TONES } from "../../components/admin/adminTheme";
import { InlineCell } from "../../components/admin/sales/InlineCell";
import { SalesTrend } from "../../components/admin/sales/SalesTrend";
import { csv, summarizeRetail } from "../../lib/sales/workspace";
import {
  EXPENSE_CATEGORY_LABELS,
  type ManualExpense,
  type SalesDashboardData,
  type SalesOrderRow,
} from "../../lib/sales/types";
import styles from "./SalesWorkspace.module.css";

type Tab = "Overview" | "Orders" | "Payments" | "Expenses" | "Reports";
type CostField =
  | "cogs"
  | "actualShippingCost"
  | "paymentFee"
  | "otherExpense"
  | "supplier"
  | "supplierReference"
  | "notes";
const COST_LABELS: Record<CostField, string> = {
  cogs: "COGS",
  actualShippingCost: "Shipping cost",
  paymentFee: "Payment fee",
  otherExpense: "Other cost",
  supplier: "Supplier",
  supplierReference: "Supplier reference",
  notes: "Notes",
};
const OPTIONAL = {
  subtotal: "Subtotal",
  refundedAmount: "Refund",
  tax: "Tax",
  supplier: "Supplier",
  supplierReference: "Supplier reference",
  tracking: "Tracking",
  paymentMethod: "Method",
  transactionId: "Transaction",
  notes: "Notes",
};
const LEGACY_KEY = "hk_sales_manual_expenses_v1";
const money = (value: number | null | undefined, currency = "USD") =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(value);
const day = (value: string) => value.slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);
const dateBefore = (days: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days + 1);
  return day(d.toISOString());
};
const keyOf = (r: SalesOrderRow) => r.channel + "-" + r.id;
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const token = await getFreshAccessToken();
  if (!token)
    throw new Error("Your session expired. Sign in again to continue.");
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "The request could not be completed.");
  return result as T;
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`${styles.badge} ${styles[tone] || ""}`}>{children}</span>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricHeading}><span>{label}</span><span aria-hidden="true" className={`${ICON_TILE} ${label.startsWith('Net sales')?ICON_TILE_TONES.brand:label.startsWith('Net profit')?ICON_TILE_TONES.green:label.startsWith('Cash')?ICON_TILE_TONES.amber:ICON_TILE_TONES.violet}`}>{label.startsWith('Net sales')?<CircleDollarSign size={16}/>:label.startsWith('Net profit')?<TrendingUp size={16}/>:label.startsWith('Cash')?<Wallet size={16}/>:<ShoppingBag size={16}/>}</span></div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
function TableFrame({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={styles.tableFrame}
      role="region"
      aria-label={label}
      tabIndex={0}
      data-sales-sheet
    >
      {children}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

export default function SalesAdmin() {
  const [data, setData] = useState<SalesDashboardData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("Overview"),
    [range, setRange] = useState("30"),
    [from, setFrom] = useState(dateBefore(30)),
    [to, setTo] = useState(today());
  const [channel, setChannel] = useState("all"),
    [currency, setCurrency] = useState("USD"),
    [status, setStatus] = useState("all"),
    [method, setMethod] = useState("all"),
    [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const [columns, setColumns] = useState<string[]>([]),
    [chooser, setChooser] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [page, setPage] = useState(1);
  const [legacy, setLegacy] = useState<ManualExpense[]>([]),
    [importing, setImporting] = useState(false),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<ManualExpense | null>(null),
    [expenseBusy, setExpenseBusy] = useState(false),
    [expenseError, setExpenseError] = useState(""),
    [showArchived, setShowArchived] = useState(false);
  const expenseQueue = useRef(Promise.resolve());
  const latest = useRef(data);
  latest.current = data;
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api<SalesDashboardData>("/api/admin/sales?period=all"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Sales.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void fetchData();
    try {
      const saved = JSON.parse(
        localStorage.getItem("hk_sales_columns_v1") || "[]",
      );
      if (Array.isArray(saved))
        setColumns(saved.filter((c) => Object.hasOwn(OPTIONAL, c)));
      const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
      if (Array.isArray(old)) setLegacy(old);
    } catch {
      /* Financial reads still come from WordPress. */
    }
  }, [fetchData]);
  useEffect(() => {
    setPage(1);
  }, [query, channel, currency, status, method, from, to]);
  const chooseRange = (value: string) => {
    setRange(value);
    if (value !== "custom") {
      setTo(today());
      setFrom(value === "all" ? "" : dateBefore(Number(value)));
    }
  };
  const inRange = (date: string) =>
    (!from || day(date) >= from) && (!to || day(date) <= to);
  const baseRows = useMemo(
    () =>
      data?.orders.filter(
        (r) =>
          r.currency === currency &&
          (!from || day(r.date) >= from) &&
          (!to || day(r.date) <= to),
      ) ?? [],
    [data, currency, from, to],
  );
  const rows = useMemo(
    () =>
      baseRows.filter(
        (r) =>
          (channel === "all" || r.channel === channel) &&
          (status === "all" || r.paymentStatus === status) &&
          (method === "all" || r.paymentMethod === method) &&
          (!query ||
            [
              r.orderNumber,
              r.customerName,
              r.customerEmail,
              r.supplier,
              r.supplierReference,
              r.notes,
              ...r.items.flatMap((i) => [i.productName, i.sku]),
            ]
              .join(" ")
              .toLowerCase()
              .includes(query)),
      ),
    [baseRows, channel, status, method, query],
  );
  const expenses = (data?.expenses ?? []).filter(
    (e) => e.currency === currency && inRange(e.date),
  );
  const activeExpenses = expenses.filter((e) => !e.archived);
  const { revenue, costs, profit } = summarizeRetail(
    rows,
    activeExpenses,
    currency,
  );
  const profitIncomplete =
    profit.hasIncompleteProfit ||
    Boolean(data?.warnings?.some((w) => w.includes("expense ledger")));
  const wholesaleUnavailable = Boolean(
    data?.warnings?.some((w) => w.includes("Wholesale records")),
  );
  const ws = rows.filter((r) => r.channel === "wholesale");
  const booked = ws.reduce((a, r) => a + r.total, 0),
    collected = ws.reduce((a, r) => a + (r.collectedAmount ?? 0), 0),
    balance = ws.reduce((a, r) => a + (r.balanceDue ?? 0), 0);
  const missing = rows.filter((r) => r.cogs == null),
    negative = rows.filter((r) => r.netProfit != null && r.netProfit < 0);
  const selectedRow = data?.orders.find((r) => keyOf(r) === selected);
  const visibleRows = rows.slice((page - 1) * 50, page * 50);
  const payments = (data?.payments ?? []).filter((p) =>
    rows.some((r) => r.channel === "retail" && r.id === p.orderId),
  );
  const unappliedLegacy = legacy.filter(
    (e) => !(data?.expenses ?? []).some((saved) => saved.id === e.id),
  );
  const setExpense = (expense: ManualExpense) =>
    setData((current) =>
      current
        ? {
            ...current,
            expenses: [
              ...(current.expenses ?? []).filter((e) => e.id !== expense.id),
              expense,
            ],
          }
        : current,
    );
  const saveExpense = async (expense: ManualExpense) => {
    const result = await api<{ expense: ManualExpense }>(
      "/api/admin/sales/expenses",
      "POST",
      expense,
    );
    setExpense(result.expense);
    return result.expense;
  };
  const editExpense = (
    id: string,
    field: keyof ManualExpense,
    value: string | number,
  ) => {
    const run = expenseQueue.current
      .catch(() => {})
      .then(async () => {
        const current = latest.current?.expenses?.find((e) => e.id === id);
        if (!current) throw new Error("Refresh this expense before editing.");
        await saveExpense({ ...current, [field]: value });
      });
    expenseQueue.current = run;
    return run;
  };
  const updateOrder = async (
    order: SalesOrderRow,
    field: CostField,
    value: string | number,
  ) => {
    if (order.channel === "wholesale") {
      const fieldMap: Partial<Record<CostField, string>> = {
        cogs: "costTotal",
        actualShippingCost: "freightTotal",
        otherExpense: "otherCosts",
      };
      if (!fieldMap[field] || !/^\d+$/.test(order.id))
        throw new Error("Edit this field in the Wholesale workspace.");
      const result = await api<{
        breakdown: {
          costTotal: number;
          freightTotal: number;
          otherCosts: number;
          commissionAmount: number;
          hkNetProfit: number;
          hkNetMarginPct: number;
          totalCost: number;
        };
      }>("/api/admin/wholesale/profit", "POST", {
        orderId: Number(order.id),
        [fieldMap[field]!]: value,
        reason: "Sales workspace cost edit",
      });
      const b = result.breakdown;
      setData((current) =>
        current
          ? {
              ...current,
              orders: current.orders.map((r) =>
                keyOf(r) !== keyOf(order)
                  ? r
                  : {
                      ...r,
                      cogs: b.costTotal,
                      cogsStatus: "verified",
                      cogsSource: "manual",
                      actualShippingCost: b.freightTotal,
                      otherExpense: b.otherCosts,
                      dealerCommission: b.commissionAmount,
                      totalCosts: b.totalCost + b.commissionAmount,
                      netProfit: b.hkNetProfit,
                      profitMarginPct: b.hkNetMarginPct,
                      isSnapshotted: true,
                    },
              ),
            }
          : current,
      );
    } else {
      const result = await api<{ order: SalesOrderRow }>(
        "/api/admin/sales/orders",
        "PATCH",
        { id: order.id, field, value },
      );
      setData((current) =>
        current
          ? {
              ...current,
              orders: current.orders.map((r) => {
                if (keyOf(r) !== keyOf(order)) return r;
                const next = { ...result.order };
                // A metadata-only response has no catalogue lookup; preserve its sourced cost until refresh.
                if (next.cogs == null && r.cogs != null && field !== "cogs") {
                  next.cogs = r.cogs;
                  next.cogsStatus = r.cogsStatus;
                  next.cogsSource = r.cogsSource;
                  next.totalCosts =
                    r.cogs +
                    next.actualShippingCost +
                    next.paymentFee +
                    next.otherExpense;
                  next.netProfit = next.netTotal - next.totalCosts;
                  next.profitMarginPct = next.netTotal
                    ? (next.netProfit / next.netTotal) * 100
                    : 0;
                }
                return next;
              }),
              payments:
                field === "paymentFee"
                  ? current.payments.map((p) =>
                      p.orderId === order.id
                        ? {
                            ...p,
                            gatewayFee: Number(value),
                            netReceived: p.receivedAmount - Number(value),
                          }
                        : p,
                    )
                  : current.payments,
            }
          : current,
      );
    }
  };
  const editCell = (
    order: SalesOrderRow,
    field: CostField,
    prefix = "table",
  ) => {
    const unsupported =
      order.channel === "wholesale" &&
      (!["cogs", "actualShippingCost", "otherExpense"].includes(field) ||
        !/^\d+$/.test(order.id));
    return unsupported ? (
      <span title="Managed in Wholesale">
        {order[field] == null ? "—" : String(order[field])}
      </span>
    ) : (
      <InlineCell
        id={`${prefix}-${keyOf(order)}-${field}`}
        label={`${COST_LABELS[field]} for order ${order.orderNumber}`}
        value={order[field]}
        numeric={!["supplier", "supplierReference", "notes"].includes(field)}
        hint={
          field === "cogs"
            ? `Cost source: ${order.cogsSource}. ${order.isSnapshotted ? "Recorded on order" : "Current catalogue cost; not frozen"}`
            : undefined
        }
        onSave={(value) => updateOrder(order, field, value)}
      />
    );
  };
  const download = (kind: string) => {
    let content: unknown[][] = [];
    if (kind === "orders")
      content = [
        [
          "Date",
          "Order",
          "Channel",
          "Customer",
          "Currency",
          "Sale / booked",
          "Cash collected",
          "COGS",
          "Shipping cost",
          "Fee",
          "Other",
          "Dealer commission",
          "Profit / projected if unpaid",
          "Margin %",
          "Payment",
          "Status",
          "Supplier",
          "Supplier reference",
          "Notes",
        ],
        ...rows.map((r) => [
          day(r.date),
          r.orderNumber,
          r.channel,
          r.customerName,
          r.currency,
          r.total,
          r.collectedAmount,
          r.cogs,
          r.actualShippingCost,
          r.paymentFee,
          r.otherExpense,
          r.dealerCommission ?? 0,
          r.netProfit,
          r.profitMarginPct,
          r.paymentStatus,
          r.status,
          r.supplier,
          r.supplierReference,
          r.notes,
        ]),
      ];
    if (kind === "expenses")
      content = [
        [
          "Date",
          "Category",
          "Description",
          "Amount",
          "Currency",
          "Method",
          "Reference",
          "Notes",
        ],
        ...activeExpenses.map((e) => [
          e.date,
          EXPENSE_CATEGORY_LABELS[e.category],
          e.description,
          e.amount,
          e.currency,
          e.paymentMethod,
          e.reference,
          e.notes,
        ]),
      ];
    if (kind === "payments")
      content = [
        [
          "Order",
          "Date",
          "Method",
          "Transaction",
          "Currency",
          "Expected",
          "Received",
          "Fee",
          "Net received",
          "Status",
        ],
        ...payments.map((p) => [
          p.orderNumber,
          day(p.date),
          p.paymentMethod,
          p.transactionId,
          p.currency,
          p.expectedAmount,
          p.receivedAmount,
          p.gatewayFee,
          p.netReceived,
          p.status,
        ]),
      ];
    if (kind === "summary")
      content = [
        ["Metric", "Amount", "Currency"],
        ["Retail net sales", revenue.netRevenue, currency],
        ["Recorded costs incl period expenses", costs.totalCosts, currency],
        [
          "Indicative retail net profit",
          profitIncomplete ? "Incomplete" : profit.netProfit,
          currency,
        ],
        ["Missing cost orders", profit.missingCogsCount, ""],
        ["Wholesale booked", booked, currency],
        ["Wholesale collected", collected, currency],
        ["Wholesale balance", balance, currency],
        ["Order filter", `${channel}; ${status}; ${method}; ${query}`, ""],
        ["Date range", `${from || "All"} to ${to}`, ""],
        [
          "Data scope",
          data?.windowCapped ? "Capped order window" : "Fetched order window",
          "",
        ],
        ["Warnings", (data?.warnings ?? []).join("; "), ""],
      ];
    const url = URL.createObjectURL(
      new Blob([csv(content)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `hk-sales-${kind}-${today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setNotice(`${kind} CSV exported with the current filters.`);
  };
  const importLegacy = async () => {
    setImporting(true);
    setError("");
    try {
      for (const expense of unappliedLegacy) await saveExpense(expense);
      localStorage.removeItem(LEGACY_KEY);
      setLegacy([]);
      setNotice("Browser expenses are now saved in WordPress.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Import failed. Your browser copy is preserved.",
      );
    } finally {
      setImporting(false);
    }
  };
  const addExpense = () => {
    setExpenseError("");
    setDraft({
      id: crypto.randomUUID(),
      date: today(),
      description: "",
      category: "other",
      amount: 0,
      currency,
      recurring: false,
      createdAt: new Date().toISOString(),
      paymentMethod: "",
      reference: "",
      notes: "",
    });
  };
  const saveDraft = async () => {
    if (!draft) return;
    setExpenseBusy(true);
    setExpenseError("");
    try {
      await saveExpense(draft);
      setDraft(null);
      setNotice("Expense saved to WordPress.");
    } catch (e) {
      setExpenseError(e instanceof Error ? e.message : "Expense save failed.");
    } finally {
      setExpenseBusy(false);
    }
  };
  return (
    <div className={styles.workspace}>
      <AdminPageHeader
        eyebrow="Commerce operations"
        title="Sales & Profit"
        description="Understand each sale. Record costs. Keep cash and profit clear."
        actions={
          <>
            <button
              className={styles.button}
              onClick={() => void fetchData()}
              disabled={loading}
            >
              <RefreshCw size={15} /> {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              className={styles.primary}
              disabled={!data || Boolean(error)}
              onClick={() =>
                download(
                  tab === "Expenses"
                    ? "expenses"
                    : tab === "Payments"
                      ? "payments"
                      : "orders",
                )
              }
            >
              <Download size={15} /> Export CSV
            </button>
          </>
        }
      />
      <nav className={styles.tabs} aria-label="Sales views">
        {(
          ["Overview", "Orders", "Payments", "Expenses", "Reports"] as Tab[]
        ).map((t) => (
          <button
            key={t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
          >
            {t}
            {t === "Orders" && data && <span>{rows.length}</span>}
          </button>
        ))}
      </nav>
      <div className={styles.filters}>
        <div className={styles.periods} aria-label="Date range">
          {[
            ["7", "7D"],
            ["30", "30D"],
            ["90", "90D"],
            ["all", "All"],
            ["custom", "Custom"],
          ].map(([v, label]) => (
            <button
              key={v}
              aria-pressed={range === v}
              onClick={() => chooseRange(v)}
            >
              {label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <>
            <label>
              From
              <input
                aria-label="From date"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                aria-label="To date"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Channel
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="all">All channels</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </label>
        <label>
          Currency
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {[
              ...new Set([
                "USD",
                ...(data?.orders.map((r) => r.currency) ?? []),
                ...(data?.expenses?.map((e) => e.currency) ?? []),
              ]),
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {(status !== "all" || method !== "all" || query) && (
          <button
            className={styles.button}
            onClick={() => {
              setStatus("all");
              setMethod("all");
              setSearch("");
            }}
          >
            Clear order filters
          </button>
        )}
        <span className={styles.rangeNote}>
          {from || "All available dates"} → {to}
        </span>
      </div>
      {error && (
        <div role="alert" className={styles.alert}>
          {error} <button onClick={() => void fetchData()}>Retry</button>
        </div>
      )}
      {from && to && from > to && (
        <div role="alert" className={styles.alert}>
          The start date must come before the end date.
        </div>
      )}
      {data?.warnings?.map((w) => (
        <div className={styles.alert} role="status" key={w}>
          {w}
        </div>
      ))}
      {data?.windowCapped && (
        <div className={styles.alert}>
          Showing the most recent {data.ordersScanned} retail orders. Older
          records are outside this report; exports use the same window.
        </div>
      )}
      {unappliedLegacy.length > 0 && (
        <div className={styles.alert}>
          {unappliedLegacy.length} expenses exist only in this browser. Import
          them to make them available across devices.{" "}
          <button
            disabled={importing || !data}
            onClick={() => void importLegacy()}
          >
            {importing ? "Importing…" : "Import browser expenses"}
          </button>
        </div>
      )}
      <p role="status" aria-live="polite" className={styles.feedback}>
        {notice}
      </p>
      {!data && loading ? (
        <div className={styles.skeleton} role="status">
          Loading financial records…
          <div />
          <div />
          <div />
        </div>
      ) : !data ? (
        <Empty>Sales records are unavailable. Retry to reconnect.</Empty>
      ) : (
        <>
          {tab === "Overview" && (
            <>
              <div className={styles.metrics}>
                <Metric
                  label="Net sales · retail"
                  value={money(revenue.netRevenue, currency)}
                  note="Paid orders less refunds"
                />
                <Metric
                  label="Net profit · retail"
                  value={
                    profitIncomplete
                      ? "Incomplete"
                      : money(profit.netProfit, currency)
                  }
                  note="Indicative · recorded costs & period expenses"
                />
                <Metric
                  label="Cash collected"
                  value={
                    wholesaleUnavailable
                      ? "Incomplete"
                      : money(
                          rows.reduce(
                            (a, r) => a + (r.collectedAmount ?? 0),
                            0,
                          ),
                          currency,
                        )
                  }
                  note="Retail & wholesale · before fees"
                />
                <Metric
                  label="Paid retail orders"
                  value={String(revenue.orderCount)}
                  note={`${ws.length} wholesale contracts in this view`}
                />
              </div>
              <div className={styles.secondary}>
                {[
                  ["Refunds", revenue.refunds],
                  ["COGS", costs.cogs],
                  ["Shipping cost", costs.shippingCost],
                  ["Fees", costs.gatewayFees],
                  ["Other expenses", costs.otherExpenses],
                  ["AOV", revenue.aov],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <span>{label}</span>
                    <strong>{money(Number(value), currency)}</strong>
                  </div>
                ))}
                <div>
                  <span>Net margin</span>
                  <strong>
                    {profitIncomplete
                      ? "Incomplete"
                      : profit.netMarginPct.toFixed(1) + "%"}
                  </strong>
                </div>
              </div>
              <div className={styles.wholesale}>
                <strong>Wholesale</strong>
                <span>
                  Booked <b>{money(booked, currency)}</b>
                </span>
                <span>
                  Collected <b>{money(collected, currency)}</b>
                </span>
                <span>
                  Balance due <b>{money(balance, currency)}</b>
                </span>
                <small>
                  Contracts and cash are separate from retail profit.
                </small>
              </div>
              <SalesTrend
                rows={rows}
                expenses={activeExpenses}
                currency={currency}
              />
              <section className={styles.panel}>
                <div className={styles.panelHeading}>
                  <h2>Needs attention</h2>
                  <span>Based on recorded data</span>
                </div>
                <div className={styles.attention}>
                  {missing.length > 0 && (
                    <button
                      onClick={() => {
                        setTab("Orders");
                        setNotice(
                          "Orders with a dash in COGS need a recorded cost.",
                        );
                      }}
                    >
                      <span>{missing.length} orders without COGS</span>
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                  {negative.length > 0 && (
                    <button
                      onClick={() => {
                        setSelected(keyOf(negative[0]));
                      }}
                    >
                      <span>{negative.length} orders with negative margin</span>
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                  {payments.some((p) => p.status !== "matched") && (
                    <button onClick={() => setTab("Payments")}>
                      <span>Review payment differences</span>
                      <ArrowUpRight size={16} />
                    </button>
                  )}
                  {rows.some((r) => r.paymentFeeSource === "estimated") && (
                    <p>
                      Some payment fees are estimated. Record actual settlement
                      fees to refine profit.
                    </p>
                  )}
                  {rows.some((r) => r.cogsSource === "auto") && (
                    <p>
                      Catalogue costs reflect current prices. Record order COGS
                      to freeze historical cost.
                    </p>
                  )}
                  {!missing.length &&
                    !negative.length &&
                    !payments.some((p) => p.status !== "matched") && (
                      <p>
                        No missing COGS or payment differences in this view.
                        Review unrecorded shipping and fee estimates before
                        closing the period.
                      </p>
                    )}
                </div>
              </section>
            </>
          )}
          {(tab === "Orders" || tab === "Payments" || tab === "Reports") && (
            <div className={styles.toolbar}>
              <label className={styles.search}>
                Search
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Order, customer, product, SKU, supplier…"
                />
              </label>
              <label>
                Payment
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="all">All statuses</option>
                  {[...new Set(data.orders.map((r) => r.paymentStatus))].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Method
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="all">All methods</option>
                  {[
                    ...new Set(
                      data.orders.map((r) => r.paymentMethod).filter(Boolean),
                    ),
                  ].map((s) => (
                    <option key={s} value={s!}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              {tab === "Orders" && (
                <button
                  className={styles.button}
                  aria-expanded={chooser}
                  onClick={() => setChooser(!chooser)}
                >
                  <SlidersHorizontal size={15} />
                  Columns
                </button>
              )}
            </div>
          )}
          {tab === "Orders" && (
            <>
              {chooser && (
                <fieldset className={styles.columnChoices}>
                  <legend>Additional columns · saved on this device</legend>
                  {Object.entries(OPTIONAL).map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={columns.includes(key)}
                        onChange={() => {
                          const next = columns.includes(key)
                            ? columns.filter((c) => c !== key)
                            : [...columns, key];
                          setColumns(next);
                          try {
                            localStorage.setItem(
                              "hk_sales_columns_v1",
                              JSON.stringify(next),
                            );
                          } catch {
                            /* Preferences are optional. */
                          }
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
              <div className={styles.tableNote}>
                <span>{rows.length} orders · Click a cost to edit</span>
                <span>Enter saves down · Tab saves across · Esc cancels</span>
              </div>
              <TableFrame label="Orders spreadsheet; scroll horizontally for costs and status">
                <table className={styles.orders}>
                  <caption className={styles.srOnly}>
                    Order financials. Editable costs are buttons. Sale means
                    booked value for wholesale; profit is projected for unpaid
                    orders.
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "Date",
                        "Order",
                        "Channel",
                        "Customer",
                        "Items",
                        "Sale / booked",
                        "Paid",
                        "COGS",
                        "Ship",
                        "Fee",
                        "Other",
                        "Profit",
                        "Margin",
                        "Payment",
                        "Status",
                        ...columns.map(
                          (c) => OPTIONAL[c as keyof typeof OPTIONAL],
                        ),
                      ].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r) => (
                      <tr key={keyOf(r)}>
                        <td>{day(r.date)}</td>
                        <td className={styles.sticky}>
                          <button
                            className={styles.orderLink}
                            onClick={() => setSelected(keyOf(r))}
                          >
                            #{r.orderNumber}
                          </button>
                        </td>
                        <td>
                          <Badge>{r.channel}</Badge>
                        </td>
                        <td>
                          <span
                            className={styles.truncate}
                            title={r.customerEmail}
                          >
                            {r.customerName}
                          </span>
                        </td>
                        <td
                          title={r.items.map((i) => i.productName).join(", ")}
                        >
                          {r.items.length
                            ? r.items.reduce((a, i) => a + i.quantity, 0)
                            : "Contract"}
                        </td>
                        <td>{money(r.total, currency)}</td>
                        <td>{money(r.collectedAmount, currency)}</td>
                        <td>{editCell(r, "cogs")}</td>
                        <td>{editCell(r, "actualShippingCost")}</td>
                        <td>{editCell(r, "paymentFee")}</td>
                        <td>{editCell(r, "otherExpense")}</td>
                        <td
                          className={
                            r.netProfit != null && r.netProfit < 0
                              ? styles.negative
                              : styles.profit
                          }
                        >
                          {money(r.netProfit, currency)}
                          {r.paymentStatus !== "paid" &&
                            r.netProfit != null && <small>Projected</small>}
                        </td>
                        <td>
                          {r.profitMarginPct == null
                            ? "—"
                            : r.profitMarginPct.toFixed(1) + "%"}
                        </td>
                        <td>
                          <Badge
                            tone={
                              r.paymentStatus === "paid"
                                ? "positive"
                                : "neutral"
                            }
                          >
                            {r.paymentStatus.replaceAll("_", " ")}
                          </Badge>
                        </td>
                        <td>{r.status.replaceAll("_", " ")}</td>
                        {columns.map((c) => (
                          <td key={c}>
                            {[
                              "supplier",
                              "supplierReference",
                              "notes",
                            ].includes(c)
                              ? editCell(r, c as CostField)
                              : ["subtotal", "refundedAmount", "tax"].includes(
                                    c,
                                  )
                                ? money(
                                    Number(r[c as keyof SalesOrderRow]),
                                    currency,
                                  )
                                : String(r[c as keyof SalesOrderRow] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && <Empty>No orders match these filters.</Empty>}
              </TableFrame>
              <div className={styles.pagination}>
                <span>
                  Profit = net sale − COGS − shipping − fees − other − dealer
                  share (wholesale).
                </span>
                <button
                  className={styles.button}
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>
                  {page} / {Math.max(1, Math.ceil(rows.length / 50))}
                </span>
                <button
                  className={styles.button}
                  disabled={page * 50 >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            </>
          )}
          {tab === "Payments" && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <h2>Payment reconciliation</h2>
                <span>WooCommerce records · fees may be estimated</span>
              </div>
              <p className={styles.explanation}>
                “Matched” compares recorded payment and order amounts. It does
                not confirm a bank settlement. Wholesale collections are shown
                separately.
              </p>
              <TableFrame label="Payment reconciliation">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Order",
                        "Date",
                        "Method",
                        "Transaction",
                        "Expected",
                        "Received",
                        "Refund",
                        "Fee",
                        "Net received",
                        "Status",
                      ].map((h) => (
                        <th scope="col" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.orderId}>
                        <td>
                          <button
                            className={styles.orderLink}
                            onClick={() => setSelected("retail-" + p.orderId)}
                          >
                            #{p.orderNumber}
                          </button>
                        </td>
                        <td>{day(p.date)}</td>
                        <td>{p.paymentMethod}</td>
                        <td>{p.transactionId || "Not recorded"}</td>
                        <td>{money(p.expectedAmount, currency)}</td>
                        <td>{money(p.receivedAmount, currency)}</td>
                        <td>
                          {money(
                            rows.find(
                              (r) =>
                                r.id === p.orderId && r.channel === "retail",
                            )?.refundedAmount,
                            currency,
                          )}
                        </td>
                        <td>{money(p.gatewayFee, currency)}</td>
                        <td>{money(p.netReceived, currency)}</td>
                        <td>
                          <Badge
                            tone={
                              p.status === "matched"
                                ? "positive"
                                : "attentionTone"
                            }
                          >
                            {p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!payments.length && (
                  <Empty>
                    No recorded retail payments match these filters.
                  </Empty>
                )}
              </TableFrame>
              <div className={styles.wholesale}>
                <strong>Wholesale collections</strong>
                <span>Booked {money(booked, currency)}</span>
                <span>Collected {money(collected, currency)}</span>
                <span>Balance {money(balance, currency)}</span>
              </div>
            </section>
          )}
          {tab === "Expenses" && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <h2>Expense ledger</h2>
                  <p>
                    Saved in WordPress · {currency} · {activeExpenses.length}{" "}
                    active entries
                  </p>
                </div>
                <button
                  className={styles.primary}
                  disabled={
                    !!draft ||
                    data.warnings?.some((w) => w.includes("expense ledger"))
                  }
                  onClick={addExpense}
                >
                  <Plus size={15} />
                  Add row
                </button>
              </div>
              <p className={styles.explanation}>
                Record general business costs here. Costs already recorded on an
                order should not be entered again. Channel and payment filters
                do not apply to general expenses.
              </p>
              <TableFrame label="Editable expense ledger">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Date",
                        "Category",
                        "Description",
                        "Amount",
                        "Payment method",
                        "Reference",
                        "Notes",
                        "Action",
                      ].map((h) => (
                        <th key={h} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draft && (
                      <tr className={styles.draft}>
                        <td>
                          <input
                            aria-label="New expense date"
                            type="date"
                            value={draft.date}
                            onChange={(e) =>
                              setDraft({ ...draft, date: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <select
                            aria-label="New expense category"
                            value={draft.category}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                category: e.target
                                  .value as ManualExpense["category"],
                              })
                            }
                          >
                            {Object.entries(EXPENSE_CATEGORY_LABELS).map(
                              ([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ),
                            )}
                          </select>
                        </td>
                        <td>
                          <input
                            autoFocus
                            aria-label="New expense description"
                            value={draft.description}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                description: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            aria-label="New expense amount"
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.amount}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                amount: Number(e.target.value),
                              })
                            }
                          />
                        </td>
                        {(["paymentMethod", "reference", "notes"] as const).map(
                          (f) => (
                            <td key={f}>
                              <input
                                aria-label={`New expense ${f}`}
                                value={draft[f]}
                                onChange={(e) =>
                                  setDraft({ ...draft, [f]: e.target.value })
                                }
                              />
                            </td>
                          ),
                        )}
                        <td>
                          <button
                            className={styles.primary}
                            disabled={expenseBusy}
                            onClick={() => void saveDraft()}
                          >
                            {expenseBusy ? "Saving…" : "Save row"}
                          </button>
                          <button
                            className={styles.button}
                            disabled={expenseBusy}
                            onClick={() => setDraft(null)}
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    )}
                    {expenses
                      .filter((e) => showArchived || !e.archived)
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((e) => (
                        <tr
                          key={e.id}
                          className={e.archived ? styles.archived : ""}
                        >
                          {(
                            [
                              "date",
                              "category",
                              "description",
                              "amount",
                              "paymentMethod",
                              "reference",
                              "notes",
                            ] as const
                          ).map((f) => (
                            <td key={f}>
                              <InlineCell
                                id={`expense-${e.id}-${f}`}
                                label={`${f} for expense ${e.description}`}
                                value={e[f]}
                                numeric={f === "amount"}
                                type={f === "date" ? "date" : "text"}
                                options={
                                  f === "category"
                                    ? EXPENSE_CATEGORY_LABELS
                                    : undefined
                                }
                                disabled={e.archived}
                                onSave={(value) => editExpense(e.id, f, value)}
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              className={styles.button}
                              onClick={() =>
                                void saveExpense({
                                  ...e,
                                  archived: !e.archived,
                                }).catch((err) => setExpenseError(err.message))
                              }
                            >
                              {e.archived ? "Restore" : "Archive"}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!expenses.length && !draft && (
                  <Empty>
                    No expenses in this range. Add a row to record your first
                    business cost.
                  </Empty>
                )}
              </TableFrame>
              {expenseError && (
                <p className={styles.alert} role="alert">
                  {expenseError}
                </p>
              )}
              <div className={styles.ledgerFooter}>
                <label>
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  Show archived entries
                </label>
                <strong>
                  Total{" "}
                  {money(
                    activeExpenses.reduce((a, e) => a + e.amount, 0),
                    currency,
                  )}
                </strong>
              </div>
            </section>
          )}
          {tab === "Reports" && (
            <section className={styles.panel}>
              <div className={styles.panelHeading}>
                <h2>Reports & exports</h2>
                <span>Current date, currency and order filters</span>
              </div>
              <p className={styles.explanation}>
                Order and payment exports follow all filters above. General
                expenses use date and currency only. Retail profit excludes
                wholesale contracts and uses recorded costs; missing COGS and
                estimates must be reviewed.
              </p>
              <div className={styles.reports}>
                {[
                  [
                    "orders",
                    "Order profitability",
                    "Sales, collections, direct costs, supplier references and margins.",
                  ],
                  [
                    "payments",
                    "Payment reconciliation",
                    "Recorded payment amounts, references, fees and differences.",
                  ],
                  [
                    "expenses",
                    "Expense journal",
                    "Active business expenses in the selected date range.",
                  ],
                  [
                    "summary",
                    "Financial summary",
                    "Retail profit and separate wholesale booked, collected and balance totals.",
                  ],
                ].map(([kind, label, description]) => (
                  <div key={kind}>
                    <div>
                      <h3>{label}</h3>
                      <p>{description}</p>
                    </div>
                    <button
                      className={styles.button}
                      onClick={() => download(kind)}
                    >
                      <Download size={15} />
                      CSV
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      {selectedRow && (
        <AdminModal
          title={`Order #${selectedRow.orderNumber}`}
          description={`${selectedRow.channel === "wholesale" ? "Wholesale contract" : "Retail order"} · ${selectedRow.customerName}`}
          variant="drawer"
          onClose={() => setSelected(null)}
          className={styles.drawer}
        >
          <div className={styles.drawerContent} data-sales-sheet>
            <section>
              <h3>Order</h3>
              <dl>
                <dt>Date</dt>
                <dd>{day(selectedRow.date)}</dd>
                <dt>Status</dt>
                <dd>{selectedRow.status}</dd>
                <dt>
                  {selectedRow.channel === "wholesale"
                    ? "Booked value"
                    : "Sale"}
                </dt>
                <dd>{money(selectedRow.total, selectedRow.currency)}</dd>
                <dt>Refund</dt>
                <dd>
                  {money(selectedRow.refundedAmount, selectedRow.currency)}
                </dd>
                <dt>Tax collected</dt>
                <dd>{money(selectedRow.tax, selectedRow.currency)}</dd>
              </dl>
              {selectedRow.items.map((i, index) => (
                <p key={index}>
                  {i.quantity} × {i.productName}
                  <small>
                    {i.sku || "No SKU"} · Cost source: {i.cogsSource}
                  </small>
                </p>
              ))}
            </section>
            <section>
              <h3>Payment</h3>
              <dl>
                <dt>Method</dt>
                <dd>{selectedRow.paymentMethod || "Not recorded"}</dd>
                <dt>Payment status</dt>
                <dd>{selectedRow.paymentStatus}</dd>
                <dt>Cash collected</dt>
                <dd>
                  {money(selectedRow.collectedAmount, selectedRow.currency)}
                </dd>
                {selectedRow.channel === "wholesale" && (
                  <>
                    <dt>Balance due</dt>
                    <dd>
                      {money(selectedRow.balanceDue, selectedRow.currency)}
                    </dd>
                  </>
                )}
                <dt>Transaction</dt>
                <dd>{selectedRow.transactionId || "Not recorded"}</dd>
              </dl>
            </section>
            <section>
              <h3>Costs</h3>
              <p>
                Editable amounts save to the same record as the spreadsheet.
              </p>
              <table>
                <tbody>
                  {(
                    [
                      "cogs",
                      "actualShippingCost",
                      "paymentFee",
                      "otherExpense",
                    ] as CostField[]
                  ).map((f) => (
                    <tr key={f}>
                      <th scope="row">{COST_LABELS[f]}</th>
                      <td>{editCell(selectedRow, f, "drawer")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <small>
                COGS: {selectedRow.cogsSource} ·{" "}
                {selectedRow.isSnapshotted ? "Recorded on order" : "Not frozen"}
                <br />
                Shipping: {selectedRow.shippingCostSource} · Fee:{" "}
                {selectedRow.paymentFeeSource}
              </small>
            </section>
            <section>
              <h3>Profit</h3>
              <dl>
                <dt>Total recorded costs</dt>
                <dd>{money(selectedRow.totalCosts, selectedRow.currency)}</dd>
                {selectedRow.channel === "wholesale" && (
                  <>
                    <dt>Dealer share included</dt>
                    <dd>
                      {money(
                        selectedRow.dealerCommission,
                        selectedRow.currency,
                      )}
                    </dd>
                  </>
                )}
                <dt>
                  {selectedRow.paymentStatus === "paid"
                    ? "Indicative net profit"
                    : "Projected profit"}
                </dt>
                <dd>
                  {selectedRow.cogs == null
                    ? "Missing COGS"
                    : money(selectedRow.netProfit, selectedRow.currency)}
                </dd>
                <dt>Margin</dt>
                <dd>
                  {selectedRow.profitMarginPct == null
                    ? "—"
                    : selectedRow.profitMarginPct.toFixed(2) + "%"}
                </dd>
              </dl>
              <p>
                Unrecorded costs and estimated fees can overstate profit. Cash
                received is not profit.
              </p>
            </section>
            <section>
              <h3>Operations</h3>
              {selectedRow.channel === "retail" ? (
                <table>
                  <tbody>
                    {(
                      ["supplier", "supplierReference", "notes"] as CostField[]
                    ).map((f) => (
                      <tr key={f}>
                        <th scope="row">{COST_LABELS[f]}</th>
                        <td>{editCell(selectedRow, f, "drawer")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <a href="/admin/wholesale">Open Wholesale workspace →</a>
              )}
            </section>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
