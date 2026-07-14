"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { resolveSubscriptionMonthlyAmount } from "../../lib/nevari-api";
import { BrandedSpinner } from "../BrandedSpinner";
import ModalScrim from "../ModalScrim";

const PRO_BADGE_SRC = "data:image/png;base64,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";

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || "").trim();
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatNumberAmount(value) {
  return new Intl.NumberFormat("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatCurrencyAmount(value, currency = "NGN") {
  return `${String(currency || "NGN").trim().toUpperCase() || "NGN"} ${formatNumberAmount(value)}`;
}

function formatPaymentMethod(paymentMethod) {
  if (!paymentMethod) {
    return "—";
  }

  const channel = String(paymentMethod.channel || "").trim().toLowerCase();
  if (channel === "card") {
    const cardType = String(paymentMethod.cardType || paymentMethod.card_type || "").trim();
    return cardType ? `${cardType.charAt(0).toUpperCase()}${cardType.slice(1)} Card` : "Debit Card";
  }
  if (channel === "bank_transfer") {
    return "Bank Transfer";
  }
  if (channel === "bank") {
    return paymentMethod.bank ? `Bank · ${paymentMethod.bank}` : "Bank";
  }
  if (channel === "ussd") {
    return "USSD";
  }
  if (channel === "qr") {
    return "QR Payment";
  }
  if (channel === "mobile_money") {
    return "Mobile Money";
  }
  return "—";
}

function getTrialDaysLeft(subscription) {
  const trialDate = subscription?.nextPaymentDate || subscription?.next_payment_date || subscription?.renewal_date || null;
  if (!trialDate) {
    return null;
  }
  const date = new Date(trialDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const diff = date.getTime() - Date.now();
  if (diff <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(diff / 86400000));
}

function getCurrentPlan(subscription) {
  const planKey = String(subscription?.plan_key || subscription?.plan || "free").trim().toLowerCase();
  const availablePlans = Array.isArray(subscription?.available_plans) ? subscription.available_plans : [];
  return availablePlans.find((plan) => String(plan?.plan_key || "").trim().toLowerCase() === planKey) || null;
}

function getPrimaryCta(subscription) {
  const status = String(subscription?.status || "free").trim().toLowerCase();
  const currentPlan = getCurrentPlan(subscription);
  const currentTier = String(subscription?.tier || currentPlan?.tier || "").trim().toLowerCase();
  const isFreePlan = currentTier === "free" || String(subscription?.plan_key || "free").trim().toLowerCase() === "free" || status === "free" || status === "none";

  if (status === "past_due") {
    return { type: "update_payment", label: "Update Card" };
  }

  if (isFreePlan) {
    return { type: "upgrade", label: "Upgrade to Pro" };
  }

  const allPlans = Array.isArray(subscription?.available_plans) ? subscription.available_plans : [];
  const highestRank = allPlans.reduce((maxRank, plan) => Math.max(maxRank, Number(plan?.rank || 0)), 0);
  const currentRank = Number(currentPlan?.rank || subscription?.rank || 0);
  const isHighestOrOnlyPlan = allPlans.length <= 1 || (currentRank > 0 && currentRank === highestRank);

  if (isHighestOrOnlyPlan) {
    return { type: "pause", label: "Pause Subscription" };
  }

  return { type: "upgrade", label: "Upgrade Plan" };
}

function shouldShowCancelFooter(subscription) {
  const status = String(subscription?.status || "free").trim().toLowerCase();
  const currentPlan = getCurrentPlan(subscription);
  const tier = String(subscription?.tier || currentPlan?.tier || "").trim().toLowerCase();
  return tier !== "free" && !["cancelled", "expired"].includes(status);
}

function useDelayClear(value, ms = 3000) {
  const [current, setCurrent] = useState(value);

  useEffect(() => {
    setCurrent(value);
    if (!value) {
      return undefined;
    }
    const timer = window.setTimeout(() => setCurrent(""), ms);
    return () => window.clearTimeout(timer);
  }, [ms, value]);

  return [current, setCurrent];
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return isMobile;
}

function ProBadge() {
  return <img src={PRO_BADGE_SRC} width="40" height="24" alt="Pro plan" className="nevari-subscription-pro-badge" draggable="false" />;
}

function SubscriptionFeedback({ message }) {
  if (!message) {
    return null;
  }
  return <p className="nevari-subscription-feedback" role="alert">{message}</p>;
}

function ButtonSpinner({ label }) {
  return (
    <>
      <span className="nevari-subscription-button-spinner" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </>
  );
}

function ConfirmationModal({ action, busy, error, onClose, onConfirm }) {
  if (!action || typeof document === "undefined") {
    return null;
  }

  const title = action === "pause" ? "Pause your subscription?" : "Cancel your subscription?";
  const description = action === "pause"
    ? "You will keep access until the current billing period ends."
    : "You will lose paid subscription benefits when the current billing period ends.";
  const confirmLabel = action === "pause" ? (busy ? "Pausing..." : "Pause subscription") : (busy ? "Cancelling..." : "Cancel subscription");

  return createPortal(
    <div className="customer-confirmation-modal nevari-subscription-modal-layer">
      <ModalScrim className="customer-modal-scrim nevari-subscription-modal-backdrop" label="Close subscription confirmation" onDismiss={busy ? undefined : onClose} />
      <div className="customer-confirmation-shell nevari-subscription-confirm-shell" role="dialog" aria-modal="true" aria-labelledby="subscription-confirmation-title">
        <div className="modal-head">
          <div>
            <h3 id="subscription-confirmation-title">{title}</h3>
            <p>{description}</p>
          </div>
          <button type="button" className="nevari-subscription-close-button" aria-label="Close subscription confirmation" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <div className="modal-body">
          <SubscriptionFeedback message={error} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" type="button" onClick={onClose} disabled={busy}>
            Keep subscription
          </button>
          <button className="btn btn-primary" type="button" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SubscriptionSheet({ open, labelledBy, onClose, children }) {
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="customer-confirmation-modal nevari-subscription-sheet-layer">
      <ModalScrim className="customer-modal-scrim nevari-subscription-sheet-backdrop" label="Close subscription details" onDismiss={onClose} />
      <section className="nevari-subscription-sheet-panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <div className="nevari-subscription-sheet-handle" aria-hidden="true" />
        <div className="nevari-subscription-sheet-header">
          <button type="button" className="nevari-subscription-close-button" aria-label="Close subscription details" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body
  );
}

function FullCard({ subscription, actionBusy, busy, error, labelId, onPrimaryAction, onCancelAction }) {
  const status = String(subscription?.status || "free").trim().toLowerCase();
  const planKey = String(subscription?.plan_key || subscription?.plan || "free").trim().toLowerCase();
  const currentPlan = getCurrentPlan(subscription);
  const tier = String(subscription?.tier || currentPlan?.tier || (planKey === "free" ? "free" : "pro")).trim().toLowerCase();
  const isFree = tier === "free" || planKey === "free" || ["free", "none"].includes(status);
  const currency = String(subscription?.currency || currentPlan?.currency || "NGN").trim().toUpperCase() || "NGN";
  const amount = isFree ? 0 : (currentPlan?.price || resolveSubscriptionMonthlyAmount(subscription));
  const planName = String(subscription?.plan || currentPlan?.name || (isFree ? "Free Plan" : "Pharmacy Pro")).trim();
  const primaryCta = getPrimaryCta(subscription);
  const frequency = String(subscription?.frequency || subscription?.interval || "monthly").trim().toLowerCase();
  const billedLabel = frequency === "yearly" || frequency === "year" ? "Billed yearly" : "Billed monthly";
  const trialDaysLeft = isFree ? getTrialDaysLeft(subscription) : null;
  const startDate = formatDate(subscription?.startDate || subscription?.start_date);
  const renewsOn = formatDate(subscription?.nextPaymentDate || subscription?.next_payment_date || subscription?.renewal_date);
  const usageTotal = Number(subscription?.free_consultations_total || 0);
  const usageUsed = Number(subscription?.free_consultations_used || 0);
  const trialEnds = formatDate(subscription?.nextPaymentDate || subscription?.next_payment_date || subscription?.renewal_date);
  const primaryLoadingLabel = primaryCta.type === "pause" ? "Pausing subscription" : primaryCta.type === "update_payment" ? "Opening billing update" : "Opening subscription action";
  const cancelLoadingLabel = "Cancelling subscription";

  return (
    <article className="nevari-subscription-card nevari-subscription-card--full">
      <div className="nevari-subscription-full-top">
        <div className="nevari-subscription-top-copy">
          <div id={labelId} className="nevari-subscription-eyebrow">Current subscription</div>
          <div className="nevari-subscription-value-row">
            <div className="nevari-subscription-amount">
              <span className="nevari-subscription-amount-currency">{currency}</span>
              {formatNumberAmount(amount)}
            </div>
            {isFree ? <span className="nevari-subscription-free-pill">Free Plan</span> : <ProBadge />}
          </div>
          {isFree ? (
            <div className="nevari-subscription-summary-line">
              Trial ends in <span className="nevari-subscription-status nevari-subscription-status--trial">{trialDaysLeft != null ? `${trialDaysLeft} days` : "soon"}</span>
            </div>
          ) : (
            <div className="nevari-subscription-summary-line">
              {planName} · {billedLabel} · <span className={`nevari-subscription-status ${status === "past_due" ? "nevari-subscription-status--past-due" : ""}`}>{status === "past_due" ? "Payment failed" : "Active"}</span>
            </div>
          )}
        </div>
        <div className="nevari-subscription-cta-wrap">
          <button type="button" className={`nevari-subscription-button ${primaryCta.type === "update_payment" ? "nevari-subscription-button--secondary" : "nevari-subscription-button--primary"}`} onClick={onPrimaryAction} disabled={busy || actionBusy === "primary"}>
            {actionBusy === "primary" ? <ButtonSpinner label={primaryLoadingLabel} /> : primaryCta.label}
          </button>
        </div>
      </div>

      <div className="nevari-subscription-divider" />

      <div className="nevari-subscription-meta-grid">
        {isFree ? (
          <>
            <div className="nevari-subscription-meta-item">
              <div className="nevari-subscription-meta-label">Consultations</div>
              <div className="nevari-subscription-meta-value">{`${usageUsed} of ${usageTotal} used`}</div>
            </div>
            {trialEnds ? (
              <div className="nevari-subscription-meta-item">
                <div className="nevari-subscription-meta-label">Trial Ends</div>
                <div className="nevari-subscription-meta-value">{trialEnds}</div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="nevari-subscription-meta-item">
              <div className="nevari-subscription-meta-label">Start Date</div>
              <div className="nevari-subscription-meta-value">{startDate || "—"}</div>
            </div>
            <div className="nevari-subscription-meta-item">
              <div className="nevari-subscription-meta-label">Payment Method</div>
              <div className="nevari-subscription-meta-value">{formatPaymentMethod(subscription?.paymentMethod || subscription?.payment_method)}</div>
            </div>
            <div className="nevari-subscription-meta-item">
              <div className="nevari-subscription-meta-label">Renews On</div>
              <div className="nevari-subscription-meta-value">{renewsOn || "—"}</div>
            </div>
          </>
        )}
      </div>

      {shouldShowCancelFooter(subscription) ? (
        <div className="nevari-subscription-footer">
          <button type="button" className="nevari-subscription-button nevari-subscription-button--ghost nevari-subscription-button--small" onClick={onCancelAction} disabled={busy || actionBusy === "cancel"}>
            {actionBusy === "cancel" ? <ButtonSpinner label={cancelLoadingLabel} /> : "Cancel Subscription"}
          </button>
        </div>
      ) : null}

      <SubscriptionFeedback message={error} />
    </article>
  );
}

function CompactCard({ subscription, onManage, profileVariant = false, actionLabel = "" }) {
  const status = String(subscription?.status || "free").trim().toLowerCase();
  const planKey = String(subscription?.plan_key || subscription?.plan || "free").trim().toLowerCase();
  const currentPlan = getCurrentPlan(subscription);
  const tier = String(subscription?.tier || currentPlan?.tier || (planKey === "free" ? "free" : "pro")).trim().toLowerCase();
  const isFree = tier === "free" || planKey === "free" || ["free", "none"].includes(status);
  const currency = String(subscription?.currency || currentPlan?.currency || "NGN").trim().toUpperCase() || "NGN";
  const amount = isFree ? 0 : (currentPlan?.price || resolveSubscriptionMonthlyAmount(subscription));
  const planName = String(subscription?.plan || currentPlan?.name || (isFree ? "Free Plan" : "Pharmacy Pro")).trim();
  const trialDaysLeft = getTrialDaysLeft(subscription);
  const renewsOn = formatDate(subscription?.nextPaymentDate || subscription?.next_payment_date || subscription?.renewal_date);
  const meta = isFree ? `${formatCurrencyAmount(0, currency)}/mo · upgrade for full access` : `${formatCurrencyAmount(amount, currency)}/mo · renews ${renewsOn || "soon"}`;

  return (
    <article className={`nevari-subscription-compact-card ${isFree ? "nevari-subscription-compact-card--free" : ""}`}>
      {profileVariant ? <img src="/ne.webp" width="44" height="44" alt="Nevari logo" className="nevari-subscription-compact-chip nevari-subscription-compact-logo" draggable="false" /> : (isFree ? null : <div className="nevari-subscription-compact-chip">P</div>)}
      <div className="nevari-subscription-compact-copy">
        <div className="nevari-subscription-compact-name-row">
          <span className="nevari-subscription-compact-name">{planName}</span>
          {isFree && trialDaysLeft != null ? <span className="nevari-subscription-compact-trial">Trial · {trialDaysLeft} days left</span> : null}
        </div>
        <div className="nevari-subscription-compact-meta">{meta}</div>
      </div>
      <div className="nevari-subscription-compact-actions">
        <button type="button" className={`nevari-subscription-button nevari-subscription-button--small ${isFree ? "nevari-subscription-button--primary" : "nevari-subscription-button--secondary"}`} onClick={onManage}>
          {actionLabel || (isFree ? "Upgrade" : "Manage")}
        </button>
      </div>
    </article>
  );
}

export default function ManageSubscription({ subscription, loading = false, busy = false, error = "", onUpgrade, onPause, onCancel, profileVariant = false, onView = null }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const [localError, setLocalError] = useState("");
  const [toast, setToast] = useDelayClear("");
  const headingId = useId();
  const openTriggerRef = useRef(null);

  useEffect(() => {
    if (!isMobile) {
      setSheetOpen(false);
    }
  }, [isMobile]);

  function closeSheet() {
    setSheetOpen(false);
    setTimeout(() => {
      openTriggerRef.current?.focus?.();
    }, 0);
  }

  function openSheet(event) {
    openTriggerRef.current = event.currentTarget;
    setSheetOpen(true);
  }

  async function handlePrimaryAction() {
    const primaryCta = getPrimaryCta(subscription);
    setLocalError("");

    if (primaryCta.type === "pause") {
      setConfirmAction("pause");
      return;
    }

    setActionBusy("primary");
    try {
      if (primaryCta.type === "update_payment") {
        const manageBillingUrl = String(subscription?.manage_billing_url || "").trim();
        if (!manageBillingUrl) {
          throw new Error("A secure update-card link is not available for this subscription yet.");
        }
        window.location.assign(manageBillingUrl);
        return;
      }

      if (typeof onUpgrade === "function") {
        await onUpgrade();
        return;
      }

      router.push("/subscription");
    } catch (actionError) {
      setLocalError(String(actionError?.message || "The subscription action could not be completed."));
    } finally {
      setActionBusy("");
    }
  }

  async function handleConfirmAction() {
    setLocalError("");
    setActionBusy(confirmAction || "cancel");
    try {
      if (confirmAction === "pause") {
        if (typeof onPause === "function") {
          await onPause();
        } else if (typeof onCancel === "function") {
          await onCancel();
        }
        setToast("Subscription paused.");
      } else if (typeof onCancel === "function") {
        await onCancel();
        setToast("Subscription cancelled.");
      }
      setConfirmAction("");
    } catch (actionError) {
      setLocalError(String(actionError?.message || "The subscription could not be updated."));
    } finally {
      setActionBusy("");
    }
  }

  if (loading) {
    return (
      <div className="nevari-subscription-root" aria-busy="true">
        <div className="nevari-subscription-card nevari-subscription-card--full nevari-subscription-skeleton-card">
          <div className="nevari-subscription-skeleton-block nevari-subscription-skeleton-block--label" />
          <div className="nevari-subscription-skeleton-block nevari-subscription-skeleton-block--value" />
          <div className="nevari-subscription-skeleton-block nevari-subscription-skeleton-block--line" />
          <div className="nevari-subscription-skeleton-spinner">
            <BrandedSpinner label="Loading subscription details" />
          </div>
        </div>
      </div>
    );
  }

  const combinedError = localError || error;

  return (
    <div className="nevari-subscription-root">
      {profileVariant ? (
        <div className="nevari-subscription-profile-only">
          <CompactCard subscription={subscription} onManage={typeof onView === "function" ? onView : openSheet} profileVariant actionLabel="View" />
        </div>
      ) : (
        <>
          <div className="nevari-subscription-desktop-only">
            <FullCard subscription={subscription} actionBusy={actionBusy} busy={busy} error={combinedError} labelId={headingId} onPrimaryAction={handlePrimaryAction} onCancelAction={() => setConfirmAction("cancel")} />
          </div>

          <div className="nevari-subscription-mobile-only">
            <CompactCard subscription={subscription} onManage={openSheet} />
          </div>
        </>
      )}

      <SubscriptionSheet open={sheetOpen} labelledBy={headingId} onClose={closeSheet}>
        <FullCard subscription={subscription} actionBusy={actionBusy} busy={busy} error={combinedError} labelId={headingId} onPrimaryAction={handlePrimaryAction} onCancelAction={() => setConfirmAction("cancel")} />
      </SubscriptionSheet>

      <ConfirmationModal
        action={confirmAction}
        busy={busy || actionBusy === "pause" || actionBusy === "cancel"}
        error={combinedError}
        onClose={() => {
          if (!busy && actionBusy !== "pause" && actionBusy !== "cancel") {
            setConfirmAction("");
          }
        }}
        onConfirm={handleConfirmAction}
      />

      {toast ? (
        <div className="snackbar success" role="status" aria-live="polite">
          <strong className="snackbar-title">Success</strong>
          <span className="snackbar-message">{toast}</span>
        </div>
      ) : null}
    </div>
  );
}
