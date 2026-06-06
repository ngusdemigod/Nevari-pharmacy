import RoleLoginPage from "../../../components/RoleLoginPage";
import { FRONTENDS } from "../../../components/frontend-config";

export default function PharmacistLoginPage() {
  return <RoleLoginPage config={FRONTENDS.pharmacist} />;
}
