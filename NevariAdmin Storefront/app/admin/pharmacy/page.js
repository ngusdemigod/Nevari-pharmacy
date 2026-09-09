import { redirect } from "next/navigation";

export default function PharmacyDashboardRedirect() {
  redirect("/admin/pharmacist");
}
