"use client";

import { useEffect, useRef } from "react";
import ModalScrim from "./ModalScrim";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])"
].join(",");

export default function CreationModalLayer({
  children,
  dismissLabel,
  layerClassName = "",
  onDismiss,
  restoreFocusSelector = "",
  submissionPending = false
}) {
  const layerRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  const pendingRef = useRef(submissionPending);

  dismissRef.current = onDismiss;
  pendingRef.current = submissionPending;

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const layer = layerRef.current;
    const dialog = layer?.querySelector('[role="dialog"]');
    const focusable = dialog ? [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)] : [];
    const initialFocus = dialog?.querySelector("[data-modal-initial-focus]") || focusable[0];

    const focusTimer = window.requestAnimationFrame(() => initialFocus?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (!pendingRef.current) {
          event.preventDefault();
          dismissRef.current?.();
        }
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const available = [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (!available.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = available[0];
      const last = available[available.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      const selectorTarget = restoreFocusSelector ? document.querySelector(restoreFocusSelector) : null;
      const restoreTarget = selectorTarget || restoreFocusRef.current;
      if (restoreTarget instanceof HTMLElement && restoreTarget.isConnected) {
        window.requestAnimationFrame(() => restoreTarget.focus());
      }
    };
  }, [restoreFocusSelector]);

  const guardedDismiss = submissionPending ? undefined : onDismiss;

  return (
    <div className="app-modal-stack creation-modal-stack">
      <div
        className={`app-modal-layer creation-modal-layer is-open ${layerClassName}`.trim()}
        ref={layerRef}
      >
        <ModalScrim
          className="app-modal-backdrop creation-modal-backdrop"
          label={dismissLabel}
          onDismiss={guardedDismiss}
        />
        {children}
      </div>
    </div>
  );
}
