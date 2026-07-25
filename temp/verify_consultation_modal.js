const path = require("path");
const { chromium } = require("../NevariAdmin Storefront/node_modules/playwright");

const stylesheetPath = path.resolve(__dirname, "../NevariAdmin Storefront/app/globals.css");

const modalMarkup = `
  <main class="app-modal-layer" style="position:relative;min-height:100dvh">
    <section class="consultation-details-modal" aria-label="Consultation details">
      <header class="consultation-details-header">
        <div class="consultation-details-heading">
          <div class="consultation-staff-avatar"><span style="display:grid">DR</span></div>
          <div><p class="consultation-details-eyebrow">Consultation #42</p><h2>Patient name</h2><p>Care managed by Doctor Name</p></div>
        </div>
        <div class="consultation-details-header-actions"><span class="status-pill success">Confirmed</span><button class="consultation-action-pill consultation-action-secondary">Close details</button></div>
      </header>
      <div class="consultation-details-scroll">
        <section class="consultation-details-section">
          <div class="consultation-details-section-head"><div><p class="consultation-details-eyebrow">Appointment overview</p><h3>Visit information</h3></div><p>Essential patient and schedule details.</p></div>
          <dl class="consultation-overview-grid">
            <div><dt>Patient</dt><dd>Patient name</dd><small>patient@example.com</small></div>
            <div><dt>Assigned clinician</dt><dd>Doctor Name</dd><small>doctor@example.com</small></div>
            <div><dt>Starts</dt><dd>July 23, 10:00 AM</dd></div>
            <div><dt>Ends</dt><dd>July 23, 10:30 AM</dd></div>
            <div><dt>Consultation type</dt><dd>Video</dd></div>
            <div><dt>Reason for visit</dt><dd>Medication review</dd></div>
          </dl>
        </section>
      </div>
      <footer class="consultation-details-actions">
        <button class="consultation-action-pill consultation-action-secondary"><span class="nevari-branded-spinner staff-button-spinner"></span><span>Saving notes...</span></button>
        <button class="consultation-action-pill consultation-action-secondary">Reschedule consultation</button>
        <button class="consultation-action-pill consultation-action-primary">Confirm consultation</button>
        <button class="consultation-action-pill consultation-action-primary">Mark as completed</button>
        <button class="consultation-action-pill consultation-action-danger">Cancel consultation</button>
      </footer>
    </section>
  </main>
`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const width of [375, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(modalMarkup);
    await page.addStyleTag({ path: stylesheetPath });
    const result = await page.evaluate(() => {
      const modal = document.querySelector(".consultation-details-modal");
      const avatar = document.querySelector(".consultation-staff-avatar");
      const buttons = [...document.querySelectorAll(".consultation-action-pill")];
      const spinner = document.querySelector(".nevari-branded-spinner");
      const modalStyle = getComputedStyle(modal);
      const avatarStyle = getComputedStyle(avatar);
      return {
        modalBackground: modalStyle.backgroundColor,
        modalShadow: modalStyle.boxShadow,
        avatarRadius: avatarStyle.borderRadius,
        pillButtons: buttons.every((button) => parseFloat(getComputedStyle(button).borderRadius) >= 20 && button.textContent.trim()),
        spinnerVisible: spinner.getBoundingClientRect().width > 0,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    results.push({ width, ...result });
    await page.screenshot({ path: `temp/consultation-modal-${width}.png`, fullPage: true });
    await page.close();
  }

  await browser.close();
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  const failed = results.some((result) => (
    result.modalBackground !== "rgb(255, 255, 255)"
    || result.modalShadow !== "none"
    || result.avatarRadius !== "50%"
    || !result.pillButtons
    || !result.spinnerVisible
    || result.horizontalOverflow
  ));
  if (failed) process.exit(1);
})();
