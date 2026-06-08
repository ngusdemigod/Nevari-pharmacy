"use server";

import { NextResponse } from "next/server";
import { isAllowedUrl } from "../../../../lib/inputValidation";
import { resolveApiBase } from "../../../customer/appointments/_shared";

export async function GET(_request, { params }) {
  const resolvedParams = await params;
  const token = String(resolvedParams?.token || "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: { message: "Appointment link is invalid." } }, { status: 404 });
  }

  const baseUrl = resolveApiBase(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || "");
  if (!baseUrl || !isAllowedUrl(baseUrl)) {
    return NextResponse.json({ ok: false, error: { message: "Backend URL is invalid." } }, { status: 500 });
  }

  const endpoint = new URL(`${baseUrl}/appointments/join/${encodeURIComponent(token)}`);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.text().catch(() => "");

  if (payload) {
    return new Response(payload, {
      status: response.status || 500,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
      },
    });
  }

  return NextResponse.json({ ok: false, error: { message: "Unable to resolve appointment link." } }, { status: response.status || 500 });
}
