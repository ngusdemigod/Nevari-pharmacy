import RoleLoginPage from "../components/RoleLoginPage";
import { FRONTENDS } from "../components/frontend-config";

export default function CustomerLoginPage() {
  return <RoleLoginPage config={FRONTENDS.patient} />;
}
