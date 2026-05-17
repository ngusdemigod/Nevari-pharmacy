import RoleLoginPage from "../../../components/RoleLoginPage";
import { FRONTENDS } from "../../../components/frontend-config";

export default function DoctorLoginPage() {
  return <RoleLoginPage config={FRONTENDS.doctor} />;
}
