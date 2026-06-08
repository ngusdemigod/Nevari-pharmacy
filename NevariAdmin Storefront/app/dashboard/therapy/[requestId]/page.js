import CustomerDashboard from "../../../_customer-dashboard";

export default async function CustomerMtmDetailPage({ params }) {
  const resolvedParams = await params;
  return <CustomerDashboard initialPage="therapy" initialMtmRequestId={resolvedParams?.requestId || ""} />;
}
