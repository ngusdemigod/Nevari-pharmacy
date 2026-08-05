const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const staffSource = fs.readFileSync(path.resolve(__dirname, "../app/components/StaffDirectory.js"), "utf8");
const governanceSource = fs.readFileSync(path.resolve(__dirname, "../../nevari-pharmacy-core/includes/class-nevari-user-governance.php"), "utf8");

async function main() {
  const sourceChecks = {
    analyticsInUi: staffSource.includes('analytics: "Analytics"'),
    uiRoleAllowlist: staffSource.includes('["administrator", "store_admin", "shop_manager"]'),
    uiRestrictionMessage: staffSource.includes("Custom dashboard permissions are available only to Administrator and Store Manager roles."),
    serverRoleAllowlist: governanceSource.includes("private const CUSTOM_PERMISSION_ROLES = ['administrator', 'store_admin', 'shop_manager'];"),
    serverNormalizesFixedRoles: governanceSource.includes("self::default_permissions_for_role($role)"),
    analyticsCapability: governanceSource.includes("'analytics' => 'nevari_storefront_analytics'"),
    storeAdminAnalyticsDefault: /'store_admin'\s*=>\s*\[[^\]]*'analytics'/.test(governanceSource),
    shopManagerAnalyticsDefault: /'shop_manager'\s*=>\s*\[[^\]]*'analytics'/.test(governanceSource)
  };
  if (Object.values(sourceChecks).some((value) => !value)) {
    throw new Error(`Permission source checks failed: ${JSON.stringify(sourceChecks)}`);
  }

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 760 } });
      await page.setContent(`
        <main class="staff-directory-detail-modal">
          ${["administrator", "store_admin", "doctor"].map((role) => {
            const customizable = ["administrator", "store_admin", "shop_manager"].includes(role);
            return `<section class="staff-access-section" data-role="${role}">
              <label class="detail-field"><span>Role</span><select><option>${role}</option></select></label>
              ${customizable
                ? `<div class="permission-controls"><h3>Dashboard permissions</h3><div class="staff-permission-tags"><button class="staff-permission-tag">Analytics <span>×</span></button></div><label class="detail-field"><span>Add permission</span><select><option>Analytics</option></select></label></div>`
                : `<div class="staff-permission-restriction"><h3>Role-based dashboard access</h3><p>Custom dashboard permissions are available only to Administrator and Store Manager roles.</p></div>`}
            </section>`;
          }).join("")}
        </main>
      `);
      await page.addStyleTag({ path: path.resolve(__dirname, "../app/globals.css") });

      const state = await page.evaluate(() => ({
        administratorControls: document.querySelector('[data-role="administrator"] .permission-controls') !== null,
        storeManagerControls: document.querySelector('[data-role="store_admin"] .permission-controls') !== null,
        doctorControls: document.querySelector('[data-role="doctor"] .permission-controls') !== null,
        doctorRestriction: document.querySelector('[data-role="doctor"] .staff-permission-restriction') !== null,
        analyticsVisible: document.querySelector('[data-role="store_admin"] .staff-permission-tag')?.textContent.includes("Analytics"),
        overflow: document.documentElement.scrollWidth > window.innerWidth
      }));
      if (!state.administratorControls || !state.storeManagerControls || state.doctorControls || !state.doctorRestriction || !state.analyticsVisible || state.overflow) {
        throw new Error(`Permission UI failed at ${width}px: ${JSON.stringify(state)}`);
      }
      console.log(`${width}px`, JSON.stringify({ sourceChecks, state }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
