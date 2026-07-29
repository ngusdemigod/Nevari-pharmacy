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
  confirmDismissMessage = "Discard unsaved changes?",
  dismissLabel,
  hasUnsavedChanges = false,
  layerClassName = "",
  onDismiss,
  restoreFocusSelector = "",
  submissionPending = false
}) {
  const layerRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const dismissRef = useRef(onDismiss);
  const dirtyRef = useRef(hasUnsavedChanges);
  const confirmMessageRef = useRef(confirmDismissMessage);
  const pendingRef = useRef(submissionPending);

  dismissRef.current = onDismiss;
  dirtyRef.current = hasUnsavedChanges;
  confirmMessageRef.current = confirmDismissMessage;
  pendingRef.current = submissionPending;

  function requestDismiss() {
    if (pendingRef.current) {
      return;
    }
    if (dirtyRef.current && !window.confirm(confirmMessageRef.current)) {
      return;
    }
    dismissRef.current?.();
  }

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    const layer = layerRef.current;
    const dialog = layer?.querySelector('[role="dialog"]');
    const focusable = dialog ? [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)] : [];
    const initialFocus = dialog?.querySelector("[data-modal-initial-focus]") || focusable[0];

    const focusTimer = window.requestAnimationFrame(() => initialFocus?.focus());

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestDismiss();
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

  const guardedDismiss = submissionPending ? undefined : requestDismiss;

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
