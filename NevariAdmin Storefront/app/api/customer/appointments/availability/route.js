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

function doctorIdValue(doctor) {
  return String(doctor?.user_id || doctor?.id || "").trim();
}

function slotMatchesRequestedTime(slot, date, time) {
  const startAt = String(slot?.start_at || slot?.start || slot?.time || "").trim();
  if (!startAt) {
    return false;
  }
  if (startAt.startsWith(`${date}T${time}`) || startAt.startsWith(`${date} ${time}`)) {
    return true;
  }
  const parsed = new Date(startAt);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  const normalizedTime = `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
  return normalizedTime === time;
}

async function fallbackDoctorAvailability(baseUrl, accessToken, date, time) {
  const doctorsResponse = await requestUpstreamJson(baseUrl, accessToken, "/doctors", {
    params: { per_page: 100, page: 1 }
  });

  if (!doctorsResponse.ok) {
    return doctorsResponse;
  }

  const doctors = normalizeDoctors(doctorsResponse.data);
  if (!doctors.length) {
    return {
      ok: true,
      status: 200,
      data: {
        available: false,
        doctor_count: 0,
        doctors: []
      },
      raw: ""
    };
  }

  const availabilityChecks = await Promise.allSettled(
    doctors.map(async (doctor) => {
      const doctorId = doctorIdValue(doctor);
      if (!doctorId) {
        return null;
      }
      const response = await requestUpstreamJson(baseUrl, accessToken, `/doctors/${doctorId}/availability`, {
        params: { date }
      });
      if (!response.ok) {
        return null;
      }
      const slots = Array.isArray(response.data?.data?.slots)
        ? response.data.data.slots
        : Array.isArray(response.data?.slots)
          ? response.data.slots
          : [];
      return slots.some((slot) => slotMatchesRequestedTime(slot, date, time)) ? doctor : null;
    })
  );

  const availableDoctors = availabilityChecks
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter(Boolean);

  return {
    ok: true,
    status: 200,
    data: {
      available: availableDoctors.length > 0,
      doctor_count: availableDoctors.length,
      doctors: availableDoctors
    },
    raw: ""
  };
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
    let response = await requestUpstreamJson(resolvedBaseUrl, accessToken, "/appointments/availability", {
      params: {
        date,
        time,
        duration_minutes: durationMinutes,
      }
    });

    if (!response.ok && response.status === 404) {
      response = await fallbackDoctorAvailability(resolvedBaseUrl, accessToken, date, time);
    }

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
