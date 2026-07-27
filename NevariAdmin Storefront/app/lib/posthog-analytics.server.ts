import "server-only";
import type { AnalyticsRange, GrowthAnalytics, MetricValue } from "./analytics-types";

const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };
const EVENT_KEYS = [
  "$pageview",
  "registration_started",
  "registration_completed",
  "consultation_started",
  "consultation_submitted",
  "appointment_booking_started",
  "appointment_booked",
  "payment_initialized",
  "payment_completed",
  "subscription_viewed",
  "subscription_started",
] as const;

const LABELS: Record<string, string> = {
  "$pageview": "Visited the service",
  registration_started: "Started registration",
  registration_completed: "Completed registration",
  consultation_submitted: "Submitted consultation",
  appointment_booked: "Booked appointment",
  payment_completed: "Completed payment",
  subscription_started: "Started subscription",
};

const DENOMINATORS: Record<string, string> = {
  registration_completion: "Of people who started registration",
  consultation_submission: "Of people who started a consultation",
  appointment_booking: "Of people who started appointment booking",
  payment_completion: "Of people who reached payment",
  subscription_conversion: "Of people who viewed a subscription option",
};

function emptyGrowth(status: GrowthAnalytics["data_status"]): GrowthAnalytics {
  const metrics = Object.fromEntries(
    ["unique_visitors", "registration_completion", "consultation_submission", "appointment_booking", "payment_completion", "subscription_conversion", "return_7_day", "return_30_day"]
      .map((key) => [key, { value: null, previous: null, change: null, denominator: DENOMINATORS[key] }])
  );
  return { generated_at: new Date().toISOString(), data_status: status, metrics, journey: [], visitors: [], devices: [], roles: [] };
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function change(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : Math.round((current - previous) * 10) / 10;
}

async function hogql(query: string, values: Record<string, unknown>) {
  const key = String(process.env.POSTHOG_PERSONAL_API_KEY || "").trim();
  const project = String(process.env.POSTHOG_PROJECT_ID || "").trim();
  const host = String(process.env.POSTHOG_QUERY_HOST || "https://us.posthog.com").trim().replace(/\/+$/, "");
  if (!key || !project) throw new Error("not_configured");
  const response = await fetch(`${host}/api/projects/${encodeURIComponent(project)}/query/`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query, values } }),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("provider_error");
  return response.json();
}

function mapCounts(row: unknown): Record<string, number> {
  const values = Array.isArray(row) ? row : [];
  return Object.fromEntries(EVENT_KEYS.map((event, index) => [event, Number(values[index] || 0)]));
}

export async function getPostHogAnalytics(range: AnalyticsRange, compare: boolean): Promise<GrowthAnalytics> {
  if (!process.env.POSTHOG_PERSONAL_API_KEY || !process.env.POSTHOG_PROJECT_ID) return emptyGrowth("not_configured");
  const days = RANGE_DAYS[range];
  const environment = String(process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "development");
  const selectCounts = EVENT_KEYS.map((event) => `uniqIf(distinct_id, event = '${event}')`).join(", ");
  const query = `SELECT ${selectCounts} FROM events WHERE timestamp >= now() - INTERVAL {days:Int64} DAY AND timestamp < now() AND properties.environment = {environment:String}`;
  const previousQuery = `SELECT ${selectCounts} FROM events WHERE timestamp >= now() - INTERVAL {doubleDays:Int64} DAY AND timestamp < now() - INTERVAL {days:Int64} DAY AND properties.environment = {environment:String}`;
  try {
    const [currentResult, previousResult] = await Promise.all([
      hogql(query, { days, environment }),
      compare ? hogql(previousQuery, { days, doubleDays: days * 2, environment }) : Promise.resolve({ results: [] }),
    ]);
    const current = mapCounts(currentResult?.results?.[0]);
    const previous = compare ? mapCounts(previousResult?.results?.[0]) : {};
    const metric = (value: number | null, prior: number | null, denominator?: string): MetricValue => ({
      value,
      previous: prior,
      change: change(value, prior),
      denominator,
    });
    const pairs: Record<string, [string, string]> = {
      registration_completion: ["registration_completed", "registration_started"],
      consultation_submission: ["consultation_submitted", "consultation_started"],
      appointment_booking: ["appointment_booked", "appointment_booking_started"],
      payment_completion: ["payment_completed", "payment_initialized"],
      subscription_conversion: ["subscription_started", "subscription_viewed"],
    };
    const metrics: Record<string, MetricValue> = {
      unique_visitors: metric(current.$pageview, compare ? previous.$pageview || 0 : null),
    };
    Object.entries(pairs).forEach(([key, [numerator, denominator]]) => {
      metrics[key] = metric(
        percent(current[numerator], current[denominator]),
        compare ? percent(previous[numerator] || 0, previous[denominator] || 0) : null,
        DENOMINATORS[key]
      );
    });
    metrics.return_7_day = metric(null, null, "Returned within seven days of login");
    metrics.return_30_day = metric(null, null, "Returned within thirty days of login");
    const journeyEvents = ["$pageview", "registration_started", "registration_completed", "consultation_submitted", "appointment_booked", "payment_completed", "subscription_started"];
    const journey = journeyEvents.map((key, index) => {
      const prior = index ? current[journeyEvents[index - 1]] : 0;
      return { key, label: LABELS[key], count: current[key], drop_off_percent: index ? (prior ? Math.round((1 - current[key] / prior) * 1000) / 10 : null) : null };
    });
    return {
      generated_at: new Date().toISOString(),
      data_status: current.$pageview > 0 ? "ready" : "insufficient_data",
      metrics,
      journey,
      visitors: [],
      devices: [],
      roles: [],
    };
  } catch {
    return emptyGrowth("unavailable");
  }
}
