"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FRONTENDS } from "../components/frontend-config";
import { clearGuestConsultationDraft, writeGuestConsultationDraft } from "../components/guest-consultation-draft";
import { setDocumentMetadata } from "../components/page-metadata";
import { loadSession } from "../components/role-session";

const APPOINTMENT_TIMEFRAME_OPTIONS = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
  "13:00",
  "13:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30",
  "17:00",
  "17:30"
];

function localDateInputValue(date = new Date()) {
  const next = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return next.toISOString().slice(0, 10);
}

function localTimeInputValue(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function buildConstantTimeframes(selectedDate, currentDate = new Date()) {
  const todayKey = localDateInputValue(currentDate);
  const currentTime = localTimeInputValue(currentDate);
  return APPOINTMENT_TIMEFRAME_OPTIONS.map((value) => ({
    value,
    disabled: selectedDate === todayKey && value <= currentTime
  }));
}

function sanitizeReason(value) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").replace(/[<>`]/g, "").slice(0, 500);
}

function buildConsultationLoginRedirect() {
  const nextPath = "/dashboard?page=appointment&prefill_booking=1&from=consultation";
  return `/login?next=${encodeURIComponent(nextPath)}&from=consultation`;
}

export default function GuestConsultationPage() {
  const router = useRouter();
  const [bookingDate, setBookingDate] = useState(() => localDateInputValue(new Date()));
  const [bookingTime, setBookingTime] = useState("");
  const [bookingReason, setBookingReason] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const availableBookingTimes = useMemo(() => buildConstantTimeframes(bookingDate), [bookingDate]);
  const hasAvailableBookingTimes = availableBookingTimes.some((slot) => !slot.disabled);
  const todayBookingDate = localDateInputValue(new Date());

  useEffect(() => {
    setDocumentMetadata("Nevari Customer | Consultation booking", "Book a consultation and continue after sign-in.");
    const session = loadSession(FRONTENDS.patient);
    if (session?.accessToken) {
      router.replace("/dashboard?page=appointment");
    }
  }, [router]);

  useEffect(() => {
    const selectedSlot = availableBookingTimes.find((slot) => slot.value === bookingTime);
    if (bookingTime && (!selectedSlot || selectedSlot.disabled)) {
      setBookingTime("");
      setBookingError("Select a future time for today.");
    }
  }, [availableBookingTimes, bookingTime]);

  function handleSubmit(event) {
    event.preventDefault();
    const nextReason = sanitizeReason(bookingReason).trim();
    const selectedSlot = availableBookingTimes.find((slot) => slot.value === bookingTime);
    if (!bookingDate || bookingDate < todayBookingDate) {
      setBookingError("Select a valid future consultation date.");
      return;
    }
    if (!selectedSlot || selectedSlot.disabled) {
      setBookingError("Select an available consultation time.");
      return;
    }
    if (nextReason.length < 3) {
      setBookingError("Reason must be at least 3 characters.");
      return;
    }

    const draft = writeGuestConsultationDraft({
      date: bookingDate,
      time: bookingTime,
      reason: nextReason,
      source: "consultation",
      createdAt: Date.now()
    });

    if (!draft) {
      clearGuestConsultationDraft();
      setBookingError("The consultation preference could not be saved. Try again.");
      return;
    }

    setRedirecting(true);
    router.push(buildConsultationLoginRedirect());
  }

  return (
    <div className="auth-gate consultation-entry-gate">
      <div className="auth-gate-shell consultation-entry-shell">
        <div className="auth-intro consultation-entry-intro">
          <img className="auth-logo" src="/ne.webp" alt="Nevari logo" />
          
        </div>
        <section className="auth-card auth-screen-card consultation-entry-card">
          <div className="auth-card-body consultation-entry-card-body">
            <div className="customer-panel-head consultation-entry-head">
              <div>
                <p className="customer-section-kicker">Guest booking</p>
                <h2>Choose a preferred consultation slot</h2>
                <p className="consultation-entry-copy">Pick a date, time, and reason now. Exact doctor availability is confirmed after you sign in.</p>
              </div>
            </div>

            <form className="consultation-entry-form" onSubmit={handleSubmit}>
              <label className="customer-mobile-field">
                <span>Date</span>
                <input
                  type="date"
                  min={todayBookingDate}
                  value={bookingDate}
                  onChange={(event) => {
                    setBookingDate(event.target.value);
                    setBookingTime("");
                    if (bookingError) setBookingError("");
                  }}
                  required
                />
              </label>

              <label className="customer-mobile-field">
                <span>Preferred time</span>
                <select
                  value={bookingTime}
                  disabled={!hasAvailableBookingTimes}
                  onChange={(event) => {
                    setBookingTime(event.target.value);
                    if (bookingError) setBookingError("");
                  }}
                  required
                >
                  <option value="">{hasAvailableBookingTimes ? "Select a time" : "No time available"}</option>
                  {availableBookingTimes.map((slot) => (
                    <option key={slot.value} value={slot.value} disabled={slot.disabled}>
                      {slot.value}
                    </option>
                  ))}
                </select>
              </label>

              <label className="customer-mobile-field">
                <span>Reason for appointment</span>
                <textarea
                  rows={4}
                  value={bookingReason}
                  placeholder="Briefly state the reason for your appointment"
                  onChange={(event) => {
                    setBookingReason(sanitizeReason(event.target.value));
                    if (bookingError) setBookingError("");
                  }}
                  required
                />
              </label>

              

              {bookingError ? <p className="customer-mobile-field-error">{bookingError}</p> : null}

              <button
                className="appointment-primary-cta customer-mobile-appointment-cta consultation-entry-cta"
                type="submit"
                disabled={redirecting || !bookingDate || !bookingTime || !bookingReason.trim()}
              >
                {redirecting ? "Redirecting..." : "Book consultation"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
