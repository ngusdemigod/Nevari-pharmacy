import { Suspense } from "react";
import { BrandedLoadingScreen } from "../../components/BrandedSpinner";
import DashboardSsoPageClient from "./page-client";

export const dynamic = "force-dynamic";

export default function DashboardSsoPage() {
  return (
    <Suspense fallback={<BrandedLoadingScreen label="Loading dashboard sign-in" />}>
      <DashboardSsoPageClient />
    </Suspense>
  );
}
