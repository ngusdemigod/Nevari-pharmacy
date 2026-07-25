import { notFound } from "next/navigation";
import CustomerDashboard from "../../_customer-dashboard";

const CUSTOMER_DASHBOARD_SECTIONS = new Set([
  "orders",
  "appointment",
  "request",
  "therapy",
  "iv-therapy",
  "profile",
  "subscription-management",
]);

export default async function CustomerDashboardSectionPage({ params }) {
  const resolvedParams = await params;
  const section = String(resolvedParams?.section || "").trim().toLowerCase();

  if (!CUSTOMER_DASHBOARD_SECTIONS.has(section)) {
    notFound();
  }

  return <CustomerDashboard initialPage={section} />;
}
