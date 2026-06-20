"use client";

import { useEffect, useState } from "react";
import { resolveSubscriptionMonthlyAmount } from "../../lib/nevari-api";
import { BrandedSpinner } from "../BrandedSpinner";

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMoney(value, currency = "NGN") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: String(currency || "NGN").trim().toUpperCase() || "NGN",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
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

export default function ManageSubscription({
  subscription,
  loading = false,
  busy = false,
  error = "",
  onUpgrade,
  onCancel,
}) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [localError, setLocalError] = useState("");
  const [toast, setToast] = useDelayClear("");

  const status = String(subscription?.status || "free").toLowerCase();
  const planKey = String(subscription?.plan_key || subscription?.plan || "free").toLowerCase();
  const frequencyRaw = String(subscription?.frequency || subscription?.interval || (planKey === "free" ? "free" : "monthly")).toLowerCase();
  const isFree = planKey === "free" || status === "free" || !subscription;
  const isCancelled = status === "cancelled" || status === "expired";
  const isPendingCancellation = isCancelled && Boolean(subscription?.accessEndsAt || subscription?.access_ends_at || subscription?.renewal_date);
  const isActive = !isFree && (status === "active" || status === "trialing" || isPendingCancellation || status === "past_due");
  const currency = String(subscription?.currency || "NGN").trim().toUpperCase() || "NGN";
  const planName = String(subscription?.plan || subscription?.plan_name || (isFree ? "Free plan" : "Nevari Access Pro")).trim();
  const amount = resolveSubscriptionMonthlyAmount(subscription);
  const nextPaymentDate = subscription?.nextPaymentDate
    ?? subscription?.next_payment_date
    ?? subscription?.renewal_date
    ?? null;
  const accessEndsAt = subscription?.accessEndsAt
    ?? subscription?.access_ends_at
    ?? subscription?.ends_at
    ?? null;
  const formattedAmount = formatMoney(isFree ? 0 : amount, currency);
  const frequencyLabel = isFree
    ? "Free"
    : frequencyRaw === "yearly" || frequencyRaw === "year"
      ? "Yearly"
      : "Monthly";
  const statusLabel = isFree
    ? "Included"
    : isPendingCancellation
      ? "Ending soon"
      : isActive
        ? "Active"
        : "Inactive";
  const billingUnit = isFree
    ? "month"
    : frequencyRaw === "yearly" || frequencyRaw === "year"
      ? "year"
      : "month";
  const nextBillingLabel = isFree
    ? "Not scheduled"
    : isPendingCancellation
      ? `Access ends on ${formatDate(accessEndsAt || nextPaymentDate) || "Not scheduled"}`
      : isActive
        ? `Auto renew: ${formatDate(nextPaymentDate) || "Not scheduled"}`
        : "Subscription cancelled";
  const actionLabel = isFree
    ? "Upgrade to Pro"
    : "Cancel";
  const isActionPending = actionBusy === "upgrade" || actionBusy === "cancel" || busy;

  useEffect(() => {
    if (!cancelOpen) {
      setLocalError("");
    }
  }, [cancelOpen]);

  async function handleUpgrade() {
    setLocalError("");
    setActionBusy("upgrade");
    try {
      await onUpgrade?.();
    } catch (error) {
      setLocalError(String(error?.message || "The subscription could not be started."));
      setActionBusy("");
    }
  }

  async function handleConfirmCancel() {
    setLocalError("");
    setActionBusy("cancel");
    try {
      await onCancel?.();
      setCancelOpen(false);
      setToast("Subscription cancelled.");
      setActionBusy("");
    } catch (error) {
      setLocalError(String(error?.message || "The subscription could not be cancelled."));
      setActionBusy("");
    }
  }

  function openCancelModal() {
    setLocalError("");
    setCancelOpen(true);
  }

  function closeCancelModal() {
    if (actionBusy === "cancel") {
      return;
    }
    setCancelOpen(false);
    setLocalError("");
  }

  if (loading) {
    return (
      <article className="customer-profile-card customer-profile-card-wide subscription-manage-card is-loading" aria-busy="true">
        <div className="subscription-manage-spinner-wrap">
          <BrandedSpinner label="Loading subscription details" />
        </div>
      </article>
    );
  }

  return (
    <>
      <article className="user-subscriptioncard">
        <div className="subscription-top">
          <div className="plan-info">
            <span className="subscription-kicker">Subscription management</span>
            <div className="subscription-plan-row">
              <h3 className="subscription-plan-name">{planName}</h3>
              <span className={`subscription-status-badge is-${statusLabel.toLowerCase().replace(/\s+/g, "-")}`}>{statusLabel}</span>
            </div>
            <span className="frequency">{frequencyLabel} plan</span>
            <span className="monthly-price">
              {isFree ? "NGN0 / month" : `${formattedAmount} / ${billingUnit}`}
            </span>
            <p className="next-subscription">{nextBillingLabel}</p>
          </div>
          <div className="total-price">
            <button
              className={`subscription-action ${isFree ? "is-primary" : isPendingCancellation ? "is-secondary" : "is-danger"}`}
              type="button"
              disabled={isActionPending}
              onClick={isFree ? handleUpgrade : openCancelModal}
            >
              {actionBusy === "upgrade"
                ? "Redirecting..."
                : actionBusy === "cancel"
                  ? "Cancelling..."
                : actionLabel}
            </button>
          </div>
        </div>
        <div className="subscription-summary-grid">
          <div className="subscription-summary-item">
            <span>Billing cycle</span>
            <strong>{frequencyLabel}</strong>
          </div>
          <div className="subscription-summary-item">
            <span>Status</span>
            <strong>{statusLabel}</strong>
          </div>
          <div className="subscription-summary-item">
            <span>Plan price</span>
            <strong>{isFree ? "NGN0 / month" : `${formattedAmount} / ${billingUnit}`}</strong>
          </div>
        </div>

        {(error || localError) ? <p className="subscription-feedback error">{localError || error}</p> : null}
        {toast ? (
          <div className="snackbar success" role="status" aria-live="polite">
            <strong className="snackbar-title">Success</strong>
            <span className="snackbar-message">{toast}</span>
          </div>
        ) : null}
      </article>

      {cancelOpen ? (
        <div className="customer-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="cancelProTitle">
          <div className="customer-confirmation-shell">
            <div className="modal-head">
              <div>
                <h3 id="cancelProTitle">Cancel Pro subscription?</h3>
                <p>Your Pro access may end when the billing period closes.</p>
              </div>
             
            </div>
            <div className="modal-body">
              
              {localError ? <p className="subscription-feedback error">{localError}</p> : null}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" type="button" onClick={closeCancelModal} disabled={actionBusy === "cancel"}>
                Keep Pro
              </button>
              <button className="btn btn-primary" type="button" onClick={handleConfirmCancel} disabled={actionBusy === "cancel"}>
                {actionBusy === "cancel" ? "Cancelling..." : "Cancel subscription"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
