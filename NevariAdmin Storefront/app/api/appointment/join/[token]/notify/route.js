"use server";

import { NextResponse } from "next/server";
import { isAllowedUrl } from "../../../../../lib/inputValidation";
import { resolveApiBase } from "../../../../customer/appointments/_shared";

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const token = String(resolvedParams?.token || "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: { message: "Appointment link is invalid." } }, { status: 404 });
  }

  const baseUrl = resolveApiBase(process.env.NEXT_PUBLIC_NEVARI_BASE_URL || "");
  if (!baseUrl || !isAllowedUrl(baseUrl)) {
    return NextResponse.json({ ok: false, error: { message: "Backend URL is invalid." } }, { status: 500 });
  }

  const endpoint = new URL(`${baseUrl}/appointments/join/${encodeURIComponent(token)}/notify`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: await request.text().catch(() => ""),
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

  return NextResponse.json({ ok: false, error: { message: "Unable to send appointment notification." } }, { status: response.status || 500 });
}
