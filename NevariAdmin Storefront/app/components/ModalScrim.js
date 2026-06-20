"use client";

export default function ModalScrim({ className = "", label = "Dismiss", onDismiss }) {
  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onDismiss}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onDismiss?.();
        }
      }}
    />
  );
}
