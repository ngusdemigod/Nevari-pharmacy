"use client";

import { useEffect, useRef, useState } from "react";

function entryToken(entry, index) {
  if (entry === undefined || entry === null) {
    return `null-${index}`;
  }

  if (typeof entry !== "object") {
    return String(entry);
  }

  const tokens = [
    entry.id,
    entry.user_id,
    entry.customer_id,
    entry.patient_user_id,
    entry.doctor_user_id,
    entry.order_id,
    entry.product_id,
    entry.number,
    entry.request_reference,
    entry.reference,
    entry.email,
    entry.updated_at,
    entry.created_at,
    entry.start_at,
    entry.status,
    entry.payment_status,
    entry.rx_status
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);

  return tokens.join(":") || `row-${index}`;
}

function sectionToken(section, index) {
  if (Array.isArray(section)) {
    return `a${index}:${section.length}:${section.slice(0, 6).map(entryToken).join("|")}`;
  }

  if (section && typeof section === "object") {
    const keys = Object.keys(section).sort().slice(0, 8);
    return `o${index}:${keys.map((key) => `${key}:${entryToken(section[key], key)}`).join("|")}`;
  }

  return `p${index}:${String(section ?? "")}`;
}

export function buildSWRRevealSignature(sections = []) {
  return sections.map((section, index) => sectionToken(section, index)).join("~");
}

export function useSWRReveal(signature, { durationMs = 240 } = {}) {
  const [active, setActive] = useState(false);
  const initializedRef = useRef(false);
  const previousSignatureRef = useRef(signature);

  useEffect(() => {
    if (!signature) {
      return undefined;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      previousSignatureRef.current = signature;
      return undefined;
    }

    if (previousSignatureRef.current === signature) {
      return undefined;
    }

    previousSignatureRef.current = signature;
    setActive(true);
    const timeoutId = window.setTimeout(() => setActive(false), durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [durationMs, signature]);

  return active;
}
