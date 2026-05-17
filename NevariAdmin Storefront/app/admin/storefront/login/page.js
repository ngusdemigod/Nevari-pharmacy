import RoleLoginPage from "../../../components/RoleLoginPage";
import { FRONTENDS } from "../../../components/frontend-config";

export default function AdminLoginPage() {
  return <RoleLoginPage config={FRONTENDS.admin} />;
}
