import CustomerDashboard from "../_customer-dashboard";

export default async function CustomerDashboardPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  return <CustomerDashboard initialPage={resolvedSearchParams?.page || "overview"} />;
}
