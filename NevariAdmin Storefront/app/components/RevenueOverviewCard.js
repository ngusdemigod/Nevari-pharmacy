"use client";

import {
  Area,
  AreaChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "motion/react";

function formatNaira(value) {
  const numericValue = Number(value || 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericValue) ? numericValue : 0);
}

function formatChange(value) {
  const numericValue = Number(value || 0);
  const prefix = numericValue > 0 ? "+" : "";
  return `${prefix}${numericValue.toFixed(1)}%`;
}

function RevenueOverviewTooltip({ active, payload, label }) {
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
        <b>{formatNaira(currentPoint?.value || 0)}</b>
      </div>
      <div>
        <span>Previous</span>
        <b>{formatNaira(previousPoint?.value || 0)}</b>
      </div>
    </div>
  );
}

export default function RevenueOverviewCard({
  title = "All revenue",
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
              <option value="monthly">{title} · This year</option>
              <option value="weekly">{title} · Last 12 weeks</option>
              <option value="daily">{title} · Last 14 days</option>
            </select>
          </label>
          <div className="revenue-overview-kpi-row">
            <strong>{formatNaira(value)}</strong>
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
              content={<RevenueOverviewTooltip />}
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
