export const FRONTENDS = {
  patient: {
    type: "patient_dashboard",
    label: "Nevari Customer",
    authDashboardName: "Customer",
    loginPrompt: "Signin to your customer dashboard",
    storageKey: "nevari_patient_dashboard_session",
    loginPath: "/login",
    dashboardPath: "/dashboard",
    allowRegistration: true
  },
  doctor: {
    type: "doctors_dashboard",
    label: "Nevari Doctor",
    authDashboardName: "Doctor",
    loginPrompt: "Signin to your Doctor's Dashboard",
    storageKey: "nevari_doctor_dashboard_session",
    loginPath: "/admin/doctor/login",
    dashboardPath: "/admin/doctor"
  },
  pharmacist: {
    type: "pharmacist_dashboard",
    label: "Nevari Pharmacist",
    authDashboardName: "Pharmacist",
    loginPrompt: "Signin to your Pharmacist Dashboard",
    storageKey: "nevari_pharmacist_dashboard_session",
    loginPath: "/admin/pharmacist/login",
    dashboardPath: "/admin/pharmacist"
  },
  admin: {
    type: "storefront",
    label: "Nevari Admin",
    authDashboardName: "Admin",
    loginPrompt: "Sign in to your admin dashboard",
    storageKey: "nevari_admin_storefront_session",
    loginPath: "/admin/storefront/login",
    setupPath: "/admin/storefront/setup",
    dashboardPath: "/admin/storefront"
  }
};
