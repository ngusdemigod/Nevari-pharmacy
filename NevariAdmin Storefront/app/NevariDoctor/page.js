import { redirect } from "next/navigation";

export default function LegacyDoctorPage() {
  redirect("/admin/doctor");
}
