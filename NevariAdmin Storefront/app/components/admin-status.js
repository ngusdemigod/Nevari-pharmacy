const STATUS_TONES = {
  success: new Set([
    "active", "approved", "available", "clear", "completed", "complete",
    "confirmed", "delivered", "fulfilled", "in_stock", "paid", "publish",
    "published", "released", "sent", "success", "trusted", "verified"
  ]),
  warning: new Set([
    "awaiting_review", "issued", "on_hold", "pending",
    "pending_review", "queued", "requested", "submitted", "under_review",
    "warning"
  ]),
  processing: new Set([
    "assigned", "assigned_to_patient", "booked", "in_progress", "ongoing",
    "processing", "scheduled", "trialing", "upcoming"
  ]),
  error: new Set([
    "banned", "cancelled", "canceled", "danger", "declined", "denied", "error",
    "failed", "forbidden", "invalid", "out_of_stock", "overdue", "rejected",
    "revoked", "suspended", "expired", "past_due"
  ]),
  refunded: new Set(["refunded"]),
  neutral: new Set(["archived", "draft", "inactive", "neutral"])
};

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function adminStatusTone(value) {
  const normalized = normalizeStatus(value);

  if (normalized === "info") {
    return "info";
  }

  for (const [tone, statuses] of Object.entries(STATUS_TONES)) {
    if (statuses.has(normalized)) {
      return tone;
    }
  }

  return "info";
}
