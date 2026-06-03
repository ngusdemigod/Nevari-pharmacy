"use client";

export default function ProtectedFeature({ allowed, fallback = null, children }) {
  if (!allowed) {
    return fallback;
  }
  return children;
}
