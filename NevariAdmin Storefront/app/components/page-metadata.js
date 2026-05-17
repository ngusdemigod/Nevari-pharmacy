"use client";

export function setDocumentMetadata(title, description) {
  if (typeof document === "undefined") {
    return;
  }

  if (title) {
    document.title = title;
  }

  if (!description) {
    return;
  }

  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", description);
}
