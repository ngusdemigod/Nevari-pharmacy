"use server";

import { NextResponse } from "next/server";
import {
  invalidNextJson,
  isAllowedUrl,
  rejectUnknownFields,
  sanitizeText
} from "../../../../lib/inputValidation";
import { customerSessionError, isUpstreamAuthFailure, requestUpstreamJson, resolveCustomerSession, upstreamErrorMessage } from "../_shared";

function asText(value) {
  return String(value || "").trim();
}

function normalizeDoctors(payload) {
  const candidateLists = [
    payload?.data?.doctors,
    payload?.doctors,
    payload?.data,
    payload?.results,
    payload?.items
  ];
  const firstArray = candidateLists.find((value) => Array.isArray(value));
  return Array.isArray(firstArray) ? firstArray : [];
}

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: { message: "Invalid payload." } }, { status: 400 });
  }

  const unknownFieldError = rejectUnknownFields(body, ["baseUrl", "accessToken", "date", "time", "durationMinutes"]);
  if (unknownFieldError) {
    return invalidNextJson(NextResponse, unknownFieldError, "payload");
  }

  const baseUrl = asText(body.baseUrl);
  const bodyAccessToken = asText(body.accessToken);
  const date = sanitizeText(body.date, { max: 10 });
  const time = sanitizeText(body.time, { max: 5 });
  const durationMinutes = Math.max(5, Number.parseInt(body.durationMinutes, 10) || 30);
  const { baseUrl: resolvedBaseUrl, accessToken } = resolveCustomerSession(request, {
    baseUrl,
    accessToken: bodyAccessToken,
  });

  if (!resolvedBaseUrl || !date || !time) {
    return NextResponse.json({ ok: false, error: { message: "Missing required fields." } }, { status: 400 });
  }
  if (!isAllowedUrl(resolvedBaseUrl)) {
    return invalidNextJson(NextResponse, "Backend URL is invalid.", "baseUrl");
  }
  if (!accessToken) {
    return NextResponse.json(customerSessionError().data, { status: 401 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return invalidNextJson(NextResponse, "Date is invalid.", "date");
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    return invalidNextJson(NextResponse, "Time is invalid.", "time");
  }

  try {
    const response = await requestUpstreamJson(resolvedBaseUrl, accessToken, "/appointments/availability", {
      params: {
        date,
        time,
        duration_minutes: durationMinutes,
      }
    });

    if (!response.ok) {
      if (isUpstreamAuthFailure(response)) {
        return NextResponse.json(customerSessionError().data, { status: 401 });
      }
      return NextResponse.json(
        {
          ok: false,
          error: { message: upstreamErrorMessage(response) || "Unable to load availability." },
          upstream_status: response.status,
          upstream: response.data,
          upstream_raw: response.raw?.slice(0, 800) || null
        },
        { status: response.status >= 400 && response.status < 500 ? response.status : 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      available: Boolean(response.data?.data?.available ?? response.data?.available),
      doctorCount: Number(response.data?.data?.doctor_count ?? response.data?.doctor_count ?? 0),
      doctors: normalizeDoctors(response.data),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { message: String(error?.message || error || "Unable to load availability.") } },
      { status: 502 }
    );
  }
}
