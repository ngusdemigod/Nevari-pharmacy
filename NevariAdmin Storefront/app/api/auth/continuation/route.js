import { NextResponse } from "next/server";

const COOKIE_NAME = "nevari_auth_continuation";
const MAX_AGE_SECONDS = 15 * 60;

function safeContinuationPath(value) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "";
  }
  try {
    const parsed = new URL(path, "https://dashboard.nevari.invalid");
    if (parsed.origin !== "https://dashboard.nevari.invalid") {
      return "";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}

export async function GET(request) {
  const path = safeContinuationPath(request.cookies.get(COOKIE_NAME)?.value);
  return NextResponse.json({ ok: true, path });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const path = safeContinuationPath(body?.path);
  if (!path) {
    return NextResponse.json({ ok: false, error: "Invalid continuation path." }, { status: 422 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, path, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
  return response;
}
