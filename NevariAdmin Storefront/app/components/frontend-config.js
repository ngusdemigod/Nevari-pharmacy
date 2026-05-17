export const FRONTENDS = {
  patient: {
    type: "patient_dashboard",
    label: "Nevari Customer",
    loginPrompt: "Signin to your customer dashboard",
    storageKey: "nevari_patient_dashboard_session",
    loginPath: "/login",
    dashboardPath: "/dashboard",
    allowRegistration: true
  },
  doctor: {
    type: "doctors_dashboard",
    label: "Nevari Doctor",
    loginPrompt: "Signin to your Doctor's Dashboard",
    storageKey: "nevari_doctor_dashboard_session",
    loginPath: "/admin/doctor/login",
    dashboardPath: "/admin/doctor"
  },
  admin: {
    type: "storefront",
    label: "Nevari Admin",
    loginPrompt: "Sign in to your admin dashboard",
    storageKey: "nevari_admin_storefront_session",
    loginPath: "/admin/storefront/login",
    setupPath: "/admin/storefront/setup",
    dashboardPath: "/admin/storefront"
  }
};
