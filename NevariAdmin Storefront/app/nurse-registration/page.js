"use client";

import { useState } from "react";
import { DEFAULT_NEVARI_BASE_URL } from "../components/frontend-config";
import RecaptchaDisclosure from "../components/RecaptchaDisclosure";
import { requireRecaptchaToken } from "../lib/recaptcha-client";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  license_number: "",
  password: "",
  consent: false,
};

export default function NurseRegistrationPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  function validateField(name, value) {
    if (["first_name", "last_name"].includes(name) && String(value).trim().length < 2) return "Enter at least 2 characters.";
    if (name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) return "Enter a valid email address.";
    if (name === "phone" && !/^[+0-9][0-9 ()-]{7,24}$/.test(String(value))) return "Enter a valid phone number.";
    if (name === "license_number" && !/^[A-Za-z0-9][A-Za-z0-9\/-]{4,39}$/.test(String(value))) return "Enter a valid nursing licence number.";
    if (name === "password" && !(String(value).length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value))) return "Use at least 12 characters with uppercase, lowercase and a number.";
    if (name === "consent" && value !== true) return "Consent is required.";
    return "";
  }

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function blur(name) {
    setErrors((current) => ({ ...current, [name]: validateField(name, form[name]) }));
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = Object.fromEntries(Object.keys(form).map((name) => [name, validateField(name, form[name])]));
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;
    setSubmitting(true);
    try {
      const captchaToken = await requireRecaptchaToken("public_submit");
      const response = await fetch("/api/nurse-registration", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-nevari-recaptcha-token": captchaToken,
        },
        body: JSON.stringify({ ...form, baseUrl: DEFAULT_NEVARI_BASE_URL }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error?.message || "Unable to submit your application.");
      setComplete(true);
      setForm(EMPTY_FORM);
    } catch (error) {
      setErrors((current) => ({ ...current, form: error.message }));
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="nurse-registration-page">
    <section className="nurse-registration-card" aria-labelledby="nurse-registration-title">
      <p className="section-kicker">Join Nevari Health</p>
      <h1 id="nurse-registration-title">Nurse registration</h1>
      {complete ? <div className="nurse-registration-success" role="status">
        <h2>Application received</h2>
        <p>Your registration is awaiting Store Admin review. We will email you when a decision is made.</p>
      </div> : <form onSubmit={submit} noValidate>
        <div className="nurse-registration-grid">
          {[["first_name", "First name", "text"], ["last_name", "Last name", "text"], ["email", "Email", "email"], ["phone", "Phone number", "tel"], ["license_number", "Nursing licence number", "text"], ["password", "Password", "password"]].map(([name, label, type]) => <label key={name}>
            <span>{label}</span>
            <input type={type} value={form[name]} onChange={(event) => update(name, event.target.value)} onBlur={() => blur(name)} aria-invalid={Boolean(errors[name])} aria-describedby={`${name}-error`} autoComplete={name === "password" ? "new-password" : name} />
            <small id={`${name}-error`} className="field-error">{errors[name]}</small>
          </label>)}
        </div>
        <label className="nurse-registration-consent">
          <input type="checkbox" checked={form.consent} onChange={(event) => update("consent", event.target.checked)} onBlur={() => blur("consent")} />
          <span>I consent to Nevari processing my registration information for credential review.</span>
        </label>
        <small className="field-error">{errors.consent}</small>
        {errors.form ? <p className="form-error" role="alert">{errors.form}</p> : null}
        <button className="primary-action" type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit application"}</button>
        <RecaptchaDisclosure />
      </form>}
    </section>
  </main>;
}
