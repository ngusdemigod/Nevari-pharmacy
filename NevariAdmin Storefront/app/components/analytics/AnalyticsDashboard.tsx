"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Analytics01Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AnalyticsResponse, MetricValue } from "../../lib/analytics-types";

type Props = { baseUrl: string; frontendType?: string };
type Range = "7d" | "30d" | "90d";

const CARDS = [
  ["unique_visitors", "Unique visitors", "Different people who visited", "blue"],
  ["registration_completion", "Registration completion", "Of people who started registration", "sand"],
  ["consultation_submission", "Consultation submission", "Of people who started a consultation", "blue"],
  ["appointment_booking", "Appointment booking", "Of people who started appointment booking", "sand"],
  ["payment_completion", "Payment completion", "Of people who reached payment", "green"],
  ["subscription_conversion", "Subscription conversion", "Of people who viewed a subscription option", "purple"],
  ["return_7_day", "Seven-day retention", "Returned within seven days of login", "blue"],
  ["return_30_day", "Thirty-day retention", "Returned within thirty days of login", "sand"],
] as const;

const fetcher = async (url: string) => {
  const response = await fetch(url, {
    headers: {
      "x-nevari-frontend-origin": window.location.origin,
      "x-nevari-frontend-type": "storefront",
    },
  });
  const payload = (await response.json()) as AnalyticsResponse;
  if (!response.ok || !payload.success) {
    const error = new Error(payload.error?.message || "Analytics is temporarily unavailable.") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return payload;
};

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function formatMoney(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

function Change({ metric }: { metric?: MetricValue }) {
  if (metric?.change === null || metric?.change === undefined) return null;
  const positive = metric.change >= 0;
  return <span className={`analytics-change ${positive ? "positive" : "negative"}`}>{positive ? "↑" : "↓"} {Math.abs(metric.change).toFixed(1)}{metric.value !== null && metric.value <= 100 ? " pp" : "%"}</span>;
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className="analytics-empty">{children}</div>;
}

export default function AnalyticsDashboard({ baseUrl }: Props) {
  const initial = useMemo(() => {
    if (typeof window === "undefined") return { range: "30d" as Range, compare: true };
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get("analytics_range");
    return { range: (["7d", "30d", "90d"].includes(String(candidate)) ? candidate : "30d") as Range, compare: params.get("analytics_compare") !== "0" };
  }, []);
  const [range, setRange] = useState<Range>(initial.range);
  const [compare, setCompare] = useState(initial.compare);
  const [sort, setSort] = useState("sales");
  const [page, setPage] = useState(1);

  const key = `/api/admin/analytics/summary?baseUrl=${encodeURIComponent(baseUrl)}&range=${range}&compare=${compare ? "1" : "0"}&sort=${sort}&page=${page}&per_page=10`;
  const { data, error, isLoading, isValidating, mutate } = useSWR<AnalyticsResponse>(key, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const payload = data?.data;
  const growth = payload?.growth;
  const commerce = payload?.commerce;

  function updateUrl(nextRange: Range, nextCompare: boolean) {
    const params = new URLSearchParams(window.location.search);
    params.set("analytics_range", nextRange);
    params.set("analytics_compare", nextCompare ? "1" : "0");
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  function selectRange(next: Range) {
    setRange(next);
    setPage(1);
    updateUrl(next, compare);
  }

  function toggleCompare() {
    const next = !compare;
    setCompare(next);
    updateUrl(range, next);
  }

  if (error?.status === 403) return <section className="analytics-state"><h1>Analytics</h1><p>You do not have permission to view analytics.</p></section>;
  if (error && !payload) return <section className="analytics-state"><h1>Analytics is temporarily unavailable</h1><p>{error.message}</p><button type="button" onClick={() => mutate()}>Try again</button></section>;

  return (
    <section className="analytics-page" aria-labelledby="analytics-title">
      <header className="analytics-header">
        <div>
          <p className="analytics-eyebrow">Product health</p>
          <h1 id="analytics-title">Analytics</h1>
          <p>Understand how people discover, use, and purchase through Nevari.</p>
        </div>
        <div className="analytics-controls">
          <label>
            <span className="sr-only">Date range</span>
            <select value={range} onChange={(event) => selectRange(event.target.value as Range)}>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>
          <button className={`analytics-toggle ${compare ? "is-on" : ""}`} type="button" role="switch" aria-checked={compare} onClick={toggleCompare}>
            <span aria-hidden="true" /> Previous period
          </button>
          <button className={`analytics-refresh ${isValidating ? "is-refreshing" : ""}`} type="button" onClick={() => mutate()} aria-label="Refresh analytics">
            <HugeiconsIcon icon={RefreshIcon} size={20} strokeWidth={1.8} />
          </button>
        </div>
      </header>

      <section className="analytics-metric-grid" aria-label="Growth metrics">
        {CARDS.map(([keyName, label, fallback, tone]) => {
          const metric = growth?.metrics?.[keyName];
          return (
            <article className={`analytics-metric ${tone}`} key={keyName}>
              <div className="analytics-metric-heading"><span>{label}</span><span className="analytics-card-icon"><HugeiconsIcon icon={Analytics01Icon} size={20} strokeWidth={1.7} /></span></div>
              <strong>{isLoading ? "···" : keyName === "unique_visitors" ? formatNumber(metric?.value) : formatPercent(metric?.value)}</strong>
              <div className="analytics-metric-foot"><small>{metric?.denominator || fallback}</small>{compare ? <Change metric={metric} /> : null}</div>
            </article>
          );
        })}
      </section>

      {growth?.data_status === "not_configured" ? <div className="analytics-section-message">Analytics is not connected yet. Commerce information remains available below.</div> : null}
      {growth?.data_status === "unavailable" ? <div className="analytics-section-message">Showing commerce information while growth analytics is temporarily unavailable.</div> : null}

      <div className="analytics-primary-grid">
        <section className="analytics-panel journey-panel">
          <div className="analytics-panel-title"><div><h2>Customer journey</h2><p>How people move from a first visit to a subscription.</p></div></div>
          {growth?.journey?.length ? <div className="analytics-journey">
            {growth.journey.map((stage, index) => {
              const first = growth.journey[0]?.count || 1;
              return <div className="analytics-journey-row" key={stage.key}>
                <div><strong>{stage.label}</strong><small>{index ? "Continued from the prior step" : "Unique visitors"}</small></div>
                <div className="analytics-bar-track"><span style={{ width: `${Math.max(3, stage.count / first * 100)}%` }}>{formatNumber(stage.count)}</span></div>
                <div>{index ? <><strong className="negative">−{formatPercent(stage.drop_off_percent)}</strong><small>from prior step</small></> : <small>Starting point</small>}</div>
              </div>;
            })}
          </div> : <EmptyPanel>There is not enough activity yet to show the customer journey.</EmptyPanel>}
        </section>

        <section className="analytics-panel visitors-panel">
          <div className="analytics-panel-title"><div><h2>Visitors over time</h2><p>Daily unique people, not page views.</p></div></div>
          <EmptyPanel>Visitor history will appear as privacy-safe events accumulate.</EmptyPanel>
        </section>
      </div>

      <div className="analytics-three-grid">
        <section className="analytics-panel">
          <div className="analytics-panel-title"><div><h2>People who return</h2><p>Visitors who came back after a successful login.</p></div></div>
          {["return_7_day", "return_30_day"].map((keyName, index) => <div className="analytics-breakdown-row" key={keyName}><span>{index ? "30 days" : "7 days"}</span><div className="analytics-mini-track"><span style={{ width: `${growth?.metrics?.[keyName]?.value || 0}%` }} /></div><strong>{formatPercent(growth?.metrics?.[keyName]?.value)}</strong></div>)}
        </section>
        <section className="analytics-panel">
          <div className="analytics-panel-title"><div><h2>Devices used</h2><p>Where visitors access the service.</p></div></div>
          {growth?.devices?.length ? growth.devices.map((item) => <div className="analytics-breakdown-row" key={item.key}><span>{item.label}</span><div className="analytics-mini-track"><span style={{ width: `${item.percent}%` }} /></div><strong>{formatPercent(item.percent)}</strong></div>) : <EmptyPanel>Device breakdown is awaiting tracked activity.</EmptyPanel>}
        </section>
        <section className="analytics-panel">
          <div className="analytics-panel-title"><div><h2>Who is using Nevari</h2><p>Aggregate breakdown by registered role.</p></div></div>
          {growth?.roles?.length ? growth.roles.map((item) => <div className="analytics-breakdown-row" key={item.key}><span>{item.label}</span><div className="analytics-mini-track"><span style={{ width: `${item.percent}%` }} /></div><strong>{formatPercent(item.percent)}</strong></div>) : <EmptyPanel>Role breakdown is awaiting tracked activity.</EmptyPanel>}
        </section>
      </div>

      <section className="analytics-section-heading"><p className="analytics-eyebrow">Store performance</p><h2>Commerce overview</h2><p>Completed WooCommerce orders for the selected period.</p></section>
      <section className="analytics-commerce-grid">
        {[
          ["Gross sales", formatMoney(commerce?.commerce.gross_sales, commerce?.currency || "USD"), "Before refunds and adjustments"],
          ["Completed orders", formatNumber(commerce?.commerce.completed_orders), "Orders with completed status"],
          ["Average order value", formatMoney(commerce?.commerce.average_order_value, commerce?.currency || "USD"), "Gross sales per completed order"],
          ["On-time fulfillment", formatPercent(commerce?.commerce.on_time_fulfillment_percent), "Completed within 48 hours"],
        ].map(([label, value, note]) => <article className="analytics-commerce-card" key={label}><span>{label}</span><strong>{isLoading ? "···" : value}</strong><small>{note}</small></article>)}
      </section>

      <div className="analytics-secondary-grid">
        <section className="analytics-panel inventory-panel">
          <div className="analytics-panel-title"><div><h2>Inventory availability</h2><p>Current catalog stock using WooCommerce thresholds.</p></div><strong>{formatPercent(commerce?.inventory.available_percent)} available</strong></div>
          <div className="analytics-inventory-counts">
            <div><strong>{formatNumber(commerce?.inventory.in_stock)}</strong><span>In stock</span></div>
            <div><strong>{formatNumber(commerce?.inventory.low_stock)}</strong><span>Low stock</span></div>
            <div><strong>{formatNumber(commerce?.inventory.out_of_stock)}</strong><span>Out of stock</span></div>
          </div>
          {commerce?.inventory.attention?.length ? <ul className="analytics-attention-list">{commerce.inventory.attention.map((item) => <li key={item.product_id}><span><strong>{item.name}</strong><small>{item.sku || `Product ${item.product_id}`}</small></span><span className={`analytics-stock ${item.status}`}>{item.status.replaceAll("_", " ")}</span></li>)}</ul> : <EmptyPanel>No inventory items need attention.</EmptyPanel>}
        </section>
        <section className="analytics-panel">
          <div className="analytics-panel-title"><div><h2>Order outcomes</h2><p>How orders finished during this period.</p></div></div>
          {commerce?.order_outcomes?.length ? commerce.order_outcomes.map((item) => <div className="analytics-outcome" key={item.status}><span>{item.status.replaceAll("-", " ")}</span><div className="analytics-mini-track"><span style={{ width: `${item.percent}%` }} /></div><strong>{item.count} · {formatPercent(item.percent)}</strong></div>) : <EmptyPanel>No orders were recorded in this period.</EmptyPanel>}
        </section>
      </div>

      <section className="analytics-panel analytics-products">
        <div className="analytics-panel-title"><div><h2>Product performance</h2><p>Purchases and sales use stable WooCommerce product identifiers.</p></div><label><span className="sr-only">Sort products</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="sales">Sort by sales</option><option value="purchases">Sort by purchases</option></select></label></div>
        <div className="analytics-table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Views</th><th>Add-to-cart</th><th>Purchased</th><th>Sales</th><th>Inventory</th></tr></thead><tbody>
          {commerce?.products.items?.map((item) => <tr key={item.product_id}><td>{item.name}</td><td>{item.sku || "—"}</td><td>—</td><td>—</td><td>{formatNumber(item.quantity)}</td><td>{formatMoney(item.sales, commerce.currency)}</td><td><span className={`analytics-stock ${item.stock_status}`}>{item.stock_status.replaceAll("_", " ")}</span></td></tr>)}
        </tbody></table></div>
        {!commerce?.products.items?.length ? <EmptyPanel>No product sales were recorded in this period.</EmptyPanel> : null}
        <div className="analytics-pagination"><span>{formatNumber(commerce?.products.total)} products</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><span>Page {page}</span><button type="button" disabled={page * 10 >= (commerce?.products.total || 0)} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
      </section>
    </section>
  );
}
