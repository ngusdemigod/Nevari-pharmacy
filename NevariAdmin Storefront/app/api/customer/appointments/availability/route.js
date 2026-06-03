import { NextResponse } from "next/server";
import {
  invalidNextJson,
  isAllowedUrl,
  isValidId,
  rejectUnknownFields,
  sanitizeText
} from "../../../../lib/inputValidation";

function asText(value) {
  return String(value || "").trim();
}

function resolveApiBase(baseUrl) {
  const cleaned = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!cleaned) return "";
  if (cleaned.includes("/wp-json/nevari/v1")) return cleaned;
  if (cleaned.includes("/wp-json/")) return `${cleaned}/nevari/v1`;
  return `${cleaned}/wp-json/nevari/v1`;
}

function normalizeSlots(payload) {
  const candidateLists = [
    payload?.data?.slots,
    payload?.slots,
    payload?.data,
    payload?.results,
    payload?.items
  ];
  const firstArray = candidateLists.find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
}

function fallbackSlots() {
  return [
    "08:00", "08:30",
    "09:00", "09:30",
    "10:00", "10:30",
    "11:00", "11:30",
    "12:00", "12:30",
    "13:00", "13:30",
    "14:00", "14:30",
    "15:00", "15:30",
    "16:00", "16:30",
    "17:00", "17:30",
    "18:00"
  ].map((time) => ({ time }));
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: { message: "Invalid payload." } }, { status: 400 });
  }
  const unknownFieldError = rejectUnknownFields(body, ["baseUrl", "accessToken", "doctorId", "date"]);
  if (unknownFieldError) {
    return invalidNextJson(NextResponse, unknownFieldError, "payload");
  }

  const baseUrl = asText(body.baseUrl);
  const accessToken = asText(body.accessToken);
  const doctorId = sanitizeText(body.doctorId, { max: 80 });
  const date = sanitizeText(body.date, { max: 10 });

  if (!baseUrl || !accessToken || !doctorId || !date) {
    return NextResponse.json({ ok: false, error: { message: "Missing required fields." } }, { status: 400 });
  }
  if (!isAllowedUrl(baseUrl)) {
    return invalidNextJson(NextResponse, "Backend URL is invalid.", "baseUrl");
  }
  if (!isValidId(doctorId)) {
    return invalidNextJson(NextResponse, "Doctor is invalid.", "doctorId");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return invalidNextJson(NextResponse, "Date is invalid.", "date");
  }

  try {
    const endpoint = `${resolveApiBase(baseUrl)}/doctors/${doctorId}/availability?date=${encodeURIComponent(date)}`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      }
    });
    const rawText = await response.text();
    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }
    const slots = normalizeSlots(payload);
    if (!response.ok) {
      if (response.status >= 500) {
        return NextResponse.json({
          ok: true,
          degraded: true,
          slots: fallbackSlots(),
          warning: "Doctor availability could not be loaded from the server. Showing fallback slots.",
          upstream_status: response.status
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error: { message: "Unable to load availability." },
          upstream_status: response.status,
          upstream: payload,
          upstream_raw: rawText?.slice(0, 800) || null
        },
        { status: 502 }
      );
    }

    // Some upstream handlers omit `success` and return arrays directly.
    // Treat successful HTTP + parsed slot list as valid.
    if (payload && payload.success === false) {
      return NextResponse.json(
        {
          ok: false,
          error: { message: "Unable to load availability." },
          upstream_status: response.status,
          upstream: payload,
          upstream_raw: rawText?.slice(0, 800) || null
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, slots });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      degraded: true,
      slots: fallbackSlots(),
      warning: "Doctor availability could not be loaded from the server. Showing fallback slots.",
      detail: String(error?.message || error || "Unknown error")
    });
  }
}
