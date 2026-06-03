"use client";

const PAYSTACK_SRC = "https://js.paystack.co/v1/inline.js";

function paystackPublicKey() {
  return String(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "").trim();
}

export async function loadPaystackInline() {
  if (typeof window === "undefined") {
    throw new Error("Paystack InlineJS can only run in the browser.");
  }
  if (window.PaystackPop) {
    return window.PaystackPop;
  }

  await new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PAYSTACK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Paystack InlineJS failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PAYSTACK_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Paystack InlineJS failed to load."));
    document.head.appendChild(script);
  });

  if (!window.PaystackPop) {
    throw new Error("Paystack InlineJS is unavailable.");
  }
  return window.PaystackPop;
}

export async function openPaystackInline(checkout) {
  const key = paystackPublicKey();
  if (!key) {
    throw new Error("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is not configured.");
  }

  const PaystackPop = await loadPaystackInline();
  return new Promise((resolve, reject) => {
    const handler = PaystackPop.setup({
      key,
      email: checkout.email,
      amount: Number(checkout.amount || 0),
      currency: checkout.currency || "NGN",
      ref: checkout.reference,
      access_code: checkout.access_code || undefined,
      plan: checkout.plan_code || undefined,
      metadata: checkout.metadata || undefined,
      callback: (response) => resolve(String(response?.reference || checkout.reference || "").trim()),
      onClose: () => reject(new Error("The payment window was closed before the subscription was completed.")),
    });
    handler.openIframe();
  });
}
