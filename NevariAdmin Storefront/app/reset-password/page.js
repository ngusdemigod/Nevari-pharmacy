import { Suspense } from "react";
import { BrandedLoadingScreen } from "../components/BrandedSpinner";
import ResetPasswordPageClient from "./page-client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<BrandedLoadingScreen label="Loading password reset" />}>
      <ResetPasswordPageClient />
    </Suspense>
  );
}
