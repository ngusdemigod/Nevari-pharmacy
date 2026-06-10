import { Suspense } from "react";
import { BrandedLoadingScreen } from "../components/BrandedSpinner";
import SubscriptionPageClient from "./page-client";

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <BrandedLoadingScreen className="subscription-shell subscription-shell-loading" label="Loading your Nevari Access Pro subscription" />
      }
    >
      <SubscriptionPageClient />
    </Suspense>
  );
}
