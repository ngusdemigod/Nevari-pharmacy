const fs = require("fs");
const path = require("path");
const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const root = path.resolve(__dirname, "..");
const routeSource = fs.readFileSync(
  path.join(root, "NevariAdmin Storefront/app/api/admin/[resource]/route.js"),
  "utf8"
);
const staffSource = fs.readFileSync(
  path.join(root, "NevariAdmin Storefront/app/components/StaffDirectory.js"),
  "utf8"
);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <button id="refresh">Refresh staff</button>
      <table><tbody id="staff"></tbody></table>
      <script>
        window.requestCacheModes = [];
        window.responses = [
          { data: { items: [] } },
          { data: { items: [{ user_id: 42, display_name: "Ncustomer", managed_role: "pharmacist" }] } }
        ];
        window.fetch = async (url, init = {}) => {
          window.requestCacheModes.push(init.cache || "");
          const payload = window.responses.shift();
          return { ok: true, json: async () => ({ success: true, ...payload }) };
        };
        async function refreshStaff() {
          const response = await fetch("/api/admin/users?scope=staff", { cache: "no-store" });
          const payload = await response.json();
          document.querySelector("#staff").innerHTML = payload.data.items.map((user) =>
            "<tr><td>" + user.display_name + "</td><td>" +
            (user.managed_role === "pharmacist" ? "Pharmacist" : user.managed_role) +
            "</td></tr>"
          ).join("");
        }
        document.querySelector("#refresh").addEventListener("click", refreshStaff);
        refreshStaff();
      </script>
    `);

    await page.getByRole("button", { name: "Refresh staff" }).click();
    await page.getByRole("cell", { name: "Ncustomer" }).waitFor();

    const browserResult = await page.evaluate(() => ({
      cacheModes: window.requestCacheModes,
      rowText: document.querySelector("#staff").innerText.replace(/\s+/g, " ").trim()
    }));
    const sourceChecks = {
      staffFetchBypassesCache: /fetch\(url,\s*\{\s*cache:\s*"no-store"/s.test(staffSource),
      governedUpstreamBypassesCache: /resource === "users"[\s\S]+?\?\s*"no-store"\s*:\s*"default"/.test(routeSource),
      governedResponseForbidsStorage: routeSource.includes('"private, no-store, max-age=0"')
    };

    const result = { sourceChecks, browserResult };
    console.log(JSON.stringify(result, null, 2));

    if (
      Object.values(sourceChecks).some((value) => !value)
      || browserResult.cacheModes.length !== 2
      || browserResult.cacheModes.some((value) => value !== "no-store")
      || browserResult.rowText !== "Ncustomer Pharmacist"
    ) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
