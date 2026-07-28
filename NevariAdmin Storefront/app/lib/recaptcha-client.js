"use client";

let scriptPromise = null;
const SCRIPT_SELECTOR = 'script[data-nevari-recaptcha="true"]';

function captchaError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function siteKey() {
  return String(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();
}

function loadRecaptcha() {
  const key = siteKey();
  if (!key) return Promise.reject(captchaError("captcha_not_configured", "Spam protection is not configured."));
  if (typeof window === "undefined") {
    return Promise.reject(captchaError("captcha_unavailable", "Spam protection is unavailable."));
  }
  if (window.grecaptcha) return Promise.resolve(window.grecaptcha);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(SCRIPT_SELECTOR);
      const script = existing || document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
      script.async = true;
      script.defer = true;
      script.dataset.nevariRecaptcha = "true";
      script.onload = () => {
        if (window.grecaptcha) {
          resolve(window.grecaptcha);
          return;
        }
        reject(captchaError("captcha_unavailable", "Spam protection is unavailable."));
      };
      script.onerror = () => reject(captchaError("captcha_load_failed", "Spam protection could not be loaded."));
      if (!existing) document.head.appendChild(script);
    }).catch((error) => {
      scriptPromise = null;
      document.querySelector(SCRIPT_SELECTOR)?.remove();
      throw error;
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
    throw captchaError("captcha_token_missing", "Spam protection did not return a verification token.");
  }
  return token;
}

export function recaptchaErrorMessage(error) {
  if (error?.code === "captcha_not_configured") {
    return "Spam protection is not configured. Please contact support.";
  }
  return "Spam protection could not be loaded. Check your connection and try again.";
}
