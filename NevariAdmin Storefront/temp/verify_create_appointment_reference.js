const { chromium } = require("playwright");

const BASE_URL = "http://127.0.0.1:3002/admin/storefront";

function json(data) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1522, height: 1001 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await context.addInitScript(() => {
    localStorage.setItem("nevari_admin_storefront_session", JSON.stringify({
      baseUrl: "https://nevarihealth.example.test",
      frontendType: "storefront",
      paired: true,
      accessToken: "server-session",
      refreshToken: "server-session",
      expiresAt: Date.now() + 3600000,
      user: {
        id: 1,
        roles: ["administrator"],
        display_name: "Modal Preview Admin",
      },
      currentPage: "overview",
    }));
  });

  await context.route("**/api/**", (route) => route.fulfill(json({
    success: true,
    data: [],
  })));
  await context.route("**/api/admin/doctors**", (route) => route.fulfill(json({
    success: true,
    data: [{
      id: 12,
      user_id: 12,
      display_name: "Dr. Amaka Okafor",
      specialty: "General Practitioner",
      email: "amaka@example.test",
    }],
  })));
  await context.route("**/api/admin/customers**", (route) => route.fulfill(json({
    success: true,
    data: [{
      id: 27,
      user_id: 27,
      name: "Ada Nwosu",
      display_name: "Ada Nwosu",
      label: "Ada Nwosu",
      email: "ada@example.test",
    }],
  })));
  await context.route("**/api/admin/appointments**", (route) => route.fulfill(json({
    success: true,
    data: [],
  })));
  try {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector(".nevari-admin-storefront", { timeout: 120000 });
    await page.locator(".auth-gate").evaluate((element) => {
      element.hidden = true;
      element.style.display = "none";
    }).catch(() => null);

    await page.getByRole("button", { name: "Create new record" }).click();
    await page.getByRole("menuitem", { name: "New Consultation" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    await page.waitForTimeout(500);

    const patientInput = dialog.getByPlaceholder("Search by email, username, or name");
    await patientInput.fill("Ada");
    await dialog.getByRole("button", { name: /Ada Nwosu/ }).click();

    const availableDay = dialog.locator(".consultation-week-day:not([disabled])").last();
    await availableDay.click();
    const availableSlot = dialog.locator(".booking-t-slot:not([disabled])").first();
    await availableSlot.click();
    await dialog.getByRole("button", { name: "30 min" }).click();
    await page.waitForTimeout(300);

    const evidence = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const body = element.querySelector(".creation-modal__body");
      const calendar = element.querySelector(".consultation-design-calendar");
      const footer = element.querySelector(".creation-modal__footer");
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        bodyOverflowX: body.scrollWidth - body.clientWidth,
        calendarOverflowX: calendar.scrollWidth - calendar.clientWidth,
        footerVisible: footer.getBoundingClientRect().bottom <= rect.bottom + 1,
        durationCount: element.querySelectorAll(".booking-duration-row .booking-dur-pill").length,
        dayCount: element.querySelectorAll(".consultation-week-day").length,
        summaryVisible: Boolean(element.querySelector(".consultation-booking-summary")),
        activeInside: element.contains(document.activeElement),
      };
    });

    if (
      evidence.width < 1388
      || evidence.width > 1390
      || evidence.bodyOverflowX > 2
      || evidence.calendarOverflowX > 2
      || !evidence.footerVisible
      || evidence.durationCount !== 5
      || evidence.dayCount !== 5
      || !evidence.summaryVisible
      || !evidence.activeInside
    ) {
      throw new Error(`Appointment reference verification failed: ${JSON.stringify(evidence)}`);
    }

    await dialog.screenshot({ path: "temp/create-appointment-reference-1522.png" });

    await dialog.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Tab");
    if (!await dialog.evaluate((element) => element.contains(document.activeElement))) {
      throw new Error("Focus escaped the appointment dialog.");
    }

    if (consoleErrors.length) {
      throw new Error(`Browser console errors: ${consoleErrors.join(" | ")}`);
    }

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
