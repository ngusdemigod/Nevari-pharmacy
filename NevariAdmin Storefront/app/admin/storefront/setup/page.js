import { redirect } from "next/navigation";

export default function AdminSetupPage() {
  redirect("/admin/storefront/login");
}
