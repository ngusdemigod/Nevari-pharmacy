import { Suspense } from "react";
import SubscriptionPageClient from "./page-client";

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <section className="subscription-shell subscription-shell-loading">
          <div className="subscription-loading-card">Loading your Nevari Access Pro subscription...</div>
        </section>
      }
    >
      <SubscriptionPageClient />
    </Suspense>
  );
}
