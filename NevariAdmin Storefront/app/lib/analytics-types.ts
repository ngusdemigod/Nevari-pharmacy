export type AnalyticsRange = "7d" | "30d" | "90d";

export type MetricValue = {
  value: number | null;
  previous: number | null;
  change: number | null;
  denominator?: string;
};

export type GrowthAnalytics = {
  generated_at: string;
  data_status: "ready" | "insufficient_data" | "not_configured" | "unavailable";
  metrics: Record<string, MetricValue>;
  journey: Array<{ key: string; label: string; count: number; drop_off_percent: number | null }>;
  visitors: Array<{ label: string; current: number; previous?: number }>;
  devices: Array<{ key: string; label: string; percent: number }>;
  roles: Array<{ key: string; label: string; percent: number }>;
};

export type CommerceAnalytics = {
  range: AnalyticsRange;
  generated_at: string;
  currency: string;
  commerce: {
    gross_sales: number;
    completed_orders: number;
    average_order_value: number | null;
    on_time_fulfillment_percent: number | null;
    previous: { gross_sales: number; completed_orders: number } | null;
  };
  products: {
    items: Array<{
      product_id: number;
      variation_id: number;
      name: string;
      sku: string;
      quantity: number;
      sales: number;
      stock_status: string;
    }>;
    page: number;
    per_page: number;
    total: number;
  };
  inventory: {
    in_stock: number;
    low_stock: number;
    out_of_stock: number;
    available_percent: number | null;
    attention: Array<{ product_id: number; name: string; sku: string; status: string; quantity: number | null }>;
  };
  order_outcomes: Array<{ status: string; count: number; percent: number }>;
  data_status: string;
};

export type AnalyticsResponse = {
  success: boolean;
  data?: {
    range: AnalyticsRange;
    compare: boolean;
    generated_at: string;
    growth: GrowthAnalytics;
    commerce: CommerceAnalytics;
  };
  error?: { message: string };
};
