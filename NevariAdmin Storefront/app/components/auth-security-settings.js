"use client";

export const AUTH_SECURITY_SETTINGS_KEY = "nevari_global_auth_security_settings";

export function defaultAuthSecuritySettings() {
  return {
    globalTwoStepVerification: false
  };
}

export function normalizeAuthSecuritySettings(settings = {}) {
  return {
    ...defaultAuthSecuritySettings(),
    globalTwoStepVerification: Boolean(settings?.globalTwoStepVerification)
  };
}

export function loadAuthSecuritySettings() {
  if (typeof window === "undefined") {
    return defaultAuthSecuritySettings();
  }

  try {
    const raw = window.localStorage.getItem(AUTH_SECURITY_SETTINGS_KEY);
    if (!raw) {
      return defaultAuthSecuritySettings();
    }
    return normalizeAuthSecuritySettings(JSON.parse(raw));
  } catch {
    return defaultAuthSecuritySettings();
  }
}

export function persistAuthSecuritySettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      AUTH_SECURITY_SETTINGS_KEY,
      JSON.stringify(normalizeAuthSecuritySettings(settings))
    );
  } catch {}
}

export function buildTwoStepVerificationRequest(settings = {}) {
  const enabled = Boolean(normalizeAuthSecuritySettings(settings).globalTwoStepVerification);
  return {
    global_two_step_verification: enabled,
    two_factor_required: enabled,
    require_verification: enabled,
    require_otp: enabled
  };
}
