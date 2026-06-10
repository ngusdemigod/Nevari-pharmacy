import { Suspense } from "react";
import { BrandedLoadingScreen } from "../../../components/BrandedSpinner";
import RoleLoginPage from "../../../components/RoleLoginPage";
import { FRONTENDS } from "../../../components/frontend-config";

export default function PharmacistLoginPage() {
  return (
    <Suspense fallback={<BrandedLoadingScreen label="Loading login" />}>
      <RoleLoginPage config={FRONTENDS.pharmacist} />
    </Suspense>
  );
}
