"use client";

let scriptPromise = null;

function siteKey() {
  return String(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();
}

function loadRecaptcha() {
  const key = siteKey();
  if (!key || typeof window === "undefined") return Promise.resolve(null);
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.grecaptcha || null);
      script.onerror = () => reject(new Error("Spam protection could not be loaded."));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export async function executeRecaptcha(action) {
  const key = siteKey();
  if (!key) return "";
  const grecaptcha = await loadRecaptcha();
  if (!grecaptcha) throw new Error("Spam protection is unavailable.");
  await new Promise((resolve) => grecaptcha.ready(resolve));
  return grecaptcha.execute(key, { action });
}

export async function requireRecaptchaToken(action = "public_submit") {
  const token = String(await executeRecaptcha(action) || "").trim();
  if (!token) {
    throw new Error("Spam protection is not configured.");
  }
  return token;
}
