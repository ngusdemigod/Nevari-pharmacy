const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "app/admin/storefront/page.js"), "utf8");
  const consultationBlock = source.match(/createModalType === "consultation" \? \([\s\S]*?\) : \(\s*<div className="profile-create-shell/)?.[0] || "";

  const checks = {
    calendarComponent: consultationBlock.includes("<BookingCalendarWidget"),
    noNativeDatePicker: !consultationBlock.includes('type="date"'),
    noPreviewSummary: !consultationBlock.includes("consultation-design-summary"),
    fullWidthShell: consultationBlock.includes('className="consultation-create-shell consultation-design-shell modal-body"'),
    calendarCallbacks: ["onDateSelect", "onSlotSelect", "onDurationChange"].every((prop) => consultationBlock.includes(prop))
  };
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  if (failed.length) throw new Error(`Appointment source checks failed: ${failed.join(", ")}`);

  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      await page.setContent(`
        <main class="nevari-admin-storefront">
          <section class="consultation-create-popup consultation-design-popup admin-surface-modal">
            <form class="create-record-form">
              <header class="stacked-order-popup-header"><div><h3>New appointment</h3><p>Book a consultation using patient details and doctor availability.</p></div><button class="icon-button">×</button></header>
              <div class="consultation-create-shell consultation-design-shell">
                <section class="consultation-design-card consultation-design-form-card">
                  <div class="consultation-design-card-title">Appointment details</div>
                  <div class="consultation-design-grid">
                    <label class="consultation-design-field"><span>Patient</span><input></label>
                    <label class="consultation-design-field"><span>Doctor</span><input></label>
                    <div class="consultation-design-calendar">
                      <div class="booking-widget admin-booking-widget">
                        <div class="booking-steps-header"><div class="booking-widget-title">Choose appointment time</div><div class="booking-widget-subtitle">Select an available date and time.</div></div>
                        <div class="booking-panel"><div class="booking-panel-heading">Pick a Date</div><div class="booking-cal-grid">${Array.from({ length: 14 }, (_, index) => `<button class="booking-cal-day">${index + 1}</button>`).join("")}</div></div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
              <footer class="stacked-order-popup-actions"><button class="pill-button">Cancel</button><button class="button-primary">Create appointment</button></footer>
            </form>
          </section>
        </main>
      `);
      await page.addStyleTag({ path: path.join(root, "app/globals.css") });

      const styles = await page.locator(".consultation-design-popup").evaluate((modal) => {
        const modalStyle = getComputedStyle(modal);
        const cardStyle = getComputedStyle(modal.querySelector(".consultation-design-card"));
        const calendarStyle = getComputedStyle(modal.querySelector(".admin-booking-widget"));
        const titleStyle = getComputedStyle(modal.querySelector("h3"));
        return {
          backgroundImage: modalStyle.backgroundImage,
          modalShadow: modalStyle.boxShadow,
          cardShadow: cardStyle.boxShadow,
          calendarShadow: calendarStyle.boxShadow,
          titleWeight: Number(titleStyle.fontWeight),
          overflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });

      if (styles.backgroundImage !== "none" || styles.modalShadow !== "none" || styles.cardShadow !== "none" || styles.calendarShadow !== "none" || styles.titleWeight > 500 || styles.overflow) {
        throw new Error(`Appointment visual checks failed at ${width}px: ${JSON.stringify(styles)}`);
      }

      console.log(`${width}px`, JSON.stringify({ checks, styles }));
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
