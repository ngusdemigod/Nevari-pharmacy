"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "motion/react";

function formatCurrency(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatChange(value) {
  const numericValue = Number(value || 0);
  const prefix = numericValue > 0 ? "+" : "";
  return `${prefix}${numericValue.toFixed(1)}%`;
}

function RevenueOverviewTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) {
    return null;
  }

  const currentPoint = payload.find((item) => item.dataKey === "revenue");
  const previousPoint = payload.find((item) => item.dataKey === "previous");

  return (
    <div className="revenue-overview-tooltip">
      <strong>{label}</strong>
      <div>
        <span>Revenue</span>
        <b>{formatCurrency(currentPoint?.value || 0, currency)}</b>
      </div>
      <div>
        <span>Previous</span>
        <b>{formatCurrency(previousPoint?.value || 0, currency)}</b>
      </div>
    </div>
  );
}

export default function RevenueOverviewCard({
  title = "All revenue",
  currency,
  value,
  changePct,
  data,
  granularity = "monthly",
  onGranularityChange,
}) {
  const chartAccent = "#174EA6";
  const safeData = Array.isArray(data) ? data : [];
  const isPositiveChange = Number(changePct || 0) >= 0;

  return (
    <motion.section
      className="revenue-overview-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
    >
      <div className="revenue-overview-card-header">
        <div className="revenue-overview-kpi">
          <label className="revenue-overview-label revenue-overview-label-select">
            <span className="sr-only">{title} granularity</span>
            <select
              className="revenue-overview-select"
              value={granularity}
              onChange={(event) => onGranularityChange?.(event.target.value)}
              aria-label={`${title} granularity`}
            >
              <option value="monthly">{title} · Monthly</option>
              <option value="weekly">{title} · Weekly</option>
              <option value="daily">{title} · Daily</option>
            </select>
          </label>
          <div className="revenue-overview-kpi-row">
            <strong>{formatCurrency(value, currency)}</strong>
            <span className={`revenue-overview-change ${isPositiveChange ? "positive" : "negative"}`}>
              {formatChange(changePct)}
            </span>
          </div>
        </div>
      </div>

      <div className="revenue-overview-chart-shell">
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart
            data={safeData}
            margin={{ top: 10, right: 10, left: 10, bottom: 6 }}
          >
            <defs>
              <linearGradient id="revenue-overview-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartAccent} stopOpacity={0.22} />
                <stop offset="65%" stopColor={chartAccent} stopOpacity={0.08} />
                <stop offset="100%" stopColor={chartAccent} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fill: "#98A2B3", fontSize: 12 }}
            />
            <YAxis hide domain={[0, "dataMax + 1000"]} />
            <Tooltip
              cursor={{ stroke: "rgba(37, 99, 235, 0.14)", strokeWidth: 1 }}
              content={<RevenueOverviewTooltip currency={currency} />}
            />
            <Line
              type="monotone"
              dataKey="previous"
              stroke={chartAccent}
              strokeOpacity={0.35}
              strokeWidth={1.8}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={chartAccent}
              strokeWidth={2.5}
              fill="url(#revenue-overview-fill)"
              fillOpacity={1}
              dot={false}
              activeDot={{ r: 4, fill: chartAccent, stroke: "#FFFFFF", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.section>
  );
}
