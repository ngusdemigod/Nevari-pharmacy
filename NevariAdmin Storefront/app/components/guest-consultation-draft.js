"use client";

export const GUEST_CONSULTATION_DRAFT_KEY = "nevari_guest_consultation_draft";
const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000;

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function normalizeGuestConsultationDraft(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const date = String(value.date || "").trim();
  const time = String(value.time || "").trim();
  const reason = String(value.reason || "").trim();
  const source = String(value.source || "").trim() || "consultation";
  const createdAt = Number(value.createdAt || 0);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  if (reason.length < 3 || reason.length > 500) {
    return null;
  }
  if (!Number.isFinite(createdAt) || createdAt <= 0) {
    return null;
  }
  if ((Date.now() - createdAt) > MAX_DRAFT_AGE_MS) {
    return null;
  }

  return {
    date,
    time,
    reason,
    source,
    createdAt
  };
}

export function readGuestConsultationDraft() {
  if (!storageAvailable()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(GUEST_CONSULTATION_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizeGuestConsultationDraft(parsed);
    if (!normalized) {
      window.localStorage.removeItem(GUEST_CONSULTATION_DRAFT_KEY);
    }
    return normalized;
  } catch {
    return null;
  }
}

export function writeGuestConsultationDraft(draft) {
  if (!storageAvailable()) {
    return null;
  }

  const normalized = normalizeGuestConsultationDraft(draft);
  if (!normalized) {
    return null;
  }

  window.localStorage.setItem(GUEST_CONSULTATION_DRAFT_KEY, JSON.stringify(normalized));
  return normalized;
}

export function clearGuestConsultationDraft() {
  if (!storageAvailable()) {
    return;
  }
  window.localStorage.removeItem(GUEST_CONSULTATION_DRAFT_KEY);
}
