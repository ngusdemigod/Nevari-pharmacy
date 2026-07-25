import MtmPaymentPageClient from "./page-client";

export default async function CustomerMtmPaymentPage({ params }) {
  const resolvedParams = await params;
  return <MtmPaymentPageClient requestId={resolvedParams?.requestId || ""} />;
}
