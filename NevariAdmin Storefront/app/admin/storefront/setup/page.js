import RoleSetupPage from "../../../components/RoleSetupPage";
import { FRONTENDS } from "../../../components/frontend-config";

export default function AdminSetupPage() {
  return <RoleSetupPage config={FRONTENDS.admin} />;
}
