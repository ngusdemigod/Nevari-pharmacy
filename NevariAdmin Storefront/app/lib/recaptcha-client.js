"use client";

let scriptPromise = null;
const SCRIPT_SELECTOR = 'script[data-nevari-recaptcha="true"]';
const SCRIPT_HOSTS = ["https://www.google.com", "https://www.recaptcha.net"];
const LOCAL_DEVELOPMENT_TOKEN = "nevari-local-development";

function captchaError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function siteKey() {
  return String(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "").trim();
}

function isLocalDevelopment() {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "::1"].includes(String(window.location.hostname || "").toLowerCase());
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
      function tryHost(index) {
        if (index >= SCRIPT_HOSTS.length) {
          reject(captchaError("captcha_load_failed", "Spam protection could not be loaded."));
          return;
        }
        document.querySelector(SCRIPT_SELECTOR)?.remove();
        const script = document.createElement("script");
        script.src = `${SCRIPT_HOSTS[index]}/recaptcha/api.js?render=${encodeURIComponent(key)}`;
        script.async = true;
        script.defer = true;
        script.dataset.nevariRecaptcha = "true";
        script.onload = () => {
          if (window.grecaptcha) {
            resolve(window.grecaptcha);
            return;
          }
          script.remove();
          tryHost(index + 1);
        };
        script.onerror = () => {
          script.remove();
          tryHost(index + 1);
        };
        document.head.appendChild(script);
      }
      tryHost(0);
    }).catch((error) => {
      scriptPromise = null;
      document.querySelector(SCRIPT_SELECTOR)?.remove();
      throw error;
    });
  }
  return scriptPromise;
}

export async function executeRecaptcha(action) {
  if (isLocalDevelopment()) return LOCAL_DEVELOPMENT_TOKEN;
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
