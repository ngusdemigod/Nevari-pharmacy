"use client";

import {
  Activity01Icon,
  AlertCircleIcon,
  Calendar01Icon,
  CalendarCheckIcon,
  CheckmarkCircle02Icon,
  ClipboardListIcon,
  ClockAlertIcon,
  CreditCardIcon,
  Doctor01Icon,
  FileClockIcon,
  Money03Icon,
  MoneyBag01Icon,
  MoneyReceive01Icon,
  Package01Icon,
  PackageOutOfStockIcon,
  PillIcon,
  PrescriptionIcon,
  ShoppingCart01Icon,
  TestTube01Icon,
  TestTubesIcon,
  UserCheck01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const TONES = ["blue", "sand", "mint", "lavender"];
const ICONS = {
  activity: Activity01Icon,
  alert: AlertCircleIcon,
  calendar: Calendar01Icon,
  calendarCheck: CalendarCheckIcon,
  check: CheckmarkCircle02Icon,
  clipboard: ClipboardListIcon,
  clockAlert: ClockAlertIcon,
  creditCard: CreditCardIcon,
  doctor: Doctor01Icon,
  fileClock: FileClockIcon,
  money: Money03Icon,
  moneyBag: MoneyBag01Icon,
  moneyReceive: MoneyReceive01Icon,
  package: Package01Icon,
  outOfStock: PackageOutOfStockIcon,
  pill: PillIcon,
  prescription: PrescriptionIcon,
  cart: ShoppingCart01Icon,
  testTube: TestTube01Icon,
  testTubes: TestTubesIcon,
  userCheck: UserCheck01Icon,
  users: UserGroupIcon,
  userLinks: UserMultipleIcon,
};

export default function AdminMetricCards({ cards = [], className = "", ariaLabel = "Page metrics", loading = false, maxCards = 4 }) {
  return (
    <section className={`admin-metric-grid ${className}`.trim()} aria-label={ariaLabel}>
      {cards.slice(0, maxCards).map((card, index) => {
        const Element = card.onClick ? "button" : "article";
        return (
          <Element
            className={`admin-metric-card admin-metric-card-${card.tone || TONES[index % TONES.length]} ${card.active ? "is-active" : ""}`.trim()}
            key={card.key || card.label}
            type={card.onClick ? "button" : undefined}
            aria-pressed={card.onClick ? Boolean(card.active) : undefined}
            onClick={card.onClick}
          >
            {loading ? <>
              <span className="admin-metric-card-head"><span className="skeleton skeleton-line skeleton-line-sm" /><span className="skeleton skeleton-circle skeleton-circle-sm" /></span>
              <span className="skeleton skeleton-line skeleton-line-md skeleton-line-tall" />
              <span className="skeleton skeleton-line skeleton-line-lg" />
            </> : <>
              <span className="admin-metric-card-head">
                <span className="admin-metric-card-label">{card.label}</span>
                <span className="admin-metric-card-icon" aria-hidden="true">
                  <HugeiconsIcon icon={ICONS[card.icon] || ClipboardListIcon} size={18} strokeWidth={1.7} />
                </span>
              </span>
              <span className="admin-metric-card-value">{card.value}</span>
              <span className="admin-metric-card-note">{card.note}</span>
            </>}
          </Element>
        );
      })}
    </section>
  );
}
