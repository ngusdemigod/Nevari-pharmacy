<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nevari — Create Product Popup</title>
  <style>
    :root {
      --primary: #0A2A5E;
      --primary-900: #061B3F;
      --primary-700: #11396F;
      --primary-100: #E8EEF7;
      --primary-50: #F4F7FB;
      --accent: #E3D7C6;
      --accent-100: #F4EEE6;
      --accent-50: #FBF8F3;
      --success: #1F8A5B;
      --warning: #B46A12;
      --danger: #B23B3B;
      --ink: #102039;
      --muted: #667085;
      --line: rgba(10,42,94,.12);
      --line-strong: rgba(10,42,94,.22);
      --white: #FFFFFF;
      --page: #EFE9DE;
      --font: Inter, Manrope, Product Sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --radius-lg: 24px;
      --pill: 999px;
      --shadow-xs: 0 6px 14px rgba(10,42,94,.07);
      --shadow-sm: 0 12px 28px rgba(10,42,94,.10);
      --inset: inset 0 1px 0 rgba(255,255,255,.72);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: var(--font);
      color: var(--ink);
      background:
        radial-gradient(circle at 14% 8%, rgba(255,255,255,.76), transparent 28%),
        radial-gradient(circle at 86% 5%, rgba(227,215,198,.80), transparent 26%),
        linear-gradient(145deg, #F8F4EE, var(--page));
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; border: 0; }

    .demo-card {
      width: min(760px, 100%);
      border-radius: 32px;
      padding: 28px;
      background: rgba(255,255,255,.62);
      border: 1px solid rgba(255,255,255,.72);
      box-shadow: var(--shadow-sm), var(--inset);
      backdrop-filter: blur(18px);
    }

    .demo-card h1 {
      margin: 0;
      color: var(--primary);
      font-size: clamp(28px, 5vw, 46px);
      line-height: 1.02;
      letter-spacing: -.05em;
      font-weight: 620;
    }

    .demo-card p {
      margin: 12px 0 22px;
      max-width: 620px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }

    .btn {
      min-height: 39px;
      padding: 0 16px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      border-radius: var(--pill);
      font-size: 12px;
      font-weight: 550;
      color: var(--primary);
      transition: transform .16s ease, box-shadow .16s ease, background .16s ease;
      white-space: nowrap;
    }

    .btn:hover { transform: translateY(-1px); }
    .btn-primary { background: var(--primary); color: white; box-shadow: 0 12px 24px rgba(10,42,94,.18); }
    .btn-primary:hover { background: var(--primary-700); }
    .btn-outline { background: rgba(255,255,255,.48); color: var(--primary); border: 1px solid var(--line); box-shadow: var(--inset); }
    .btn-icon { width: 39px; padding: 0; }

    .plus {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(255,255,255,.18);
      line-height: 1;
    }

    .ui-icon {
      width: 18px;
      height: 18px;
      display: block;
      fill: none;
      stroke: currentColor;
    }

    .form-control {
      height: 44px;
      min-width: 210px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(255,255,255,.70);
      padding: 0 14px;
      outline: none;
      color: var(--primary);
      box-shadow: var(--inset);
      font-size: 12.5px;
      font-weight: 400;
    }

    textarea.form-control { height: 90px; padding: 12px 14px; resize: vertical; }

    .rx-live-modal {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(6,27,63,.34);
      backdrop-filter: blur(8px);
      opacity: 0;
      pointer-events: none;
      transition: opacity .2s ease;
    }

    .rx-live-modal.visible { opacity: 1; pointer-events: auto; }

    .modal-frame {
      position: relative;
      z-index: 1;
      width: min(880px, 100%);
      border-radius: 30px;
      background: #FBF8F3;
      border: 1px solid rgba(255,255,255,.70);
      box-shadow: var(--shadow-sm), var(--inset);
      backdrop-filter: blur(18px);
      transform: translateY(12px);
      transition: transform .2s ease;
      display: flex;
      flex-direction: column;
      max-height: min(760px, calc(100vh - 40px));
      overflow: hidden;
    }

    .rx-live-modal.visible .modal-frame { transform: translateY(0); }

    .modal-head {
      position: sticky;
      top: 0;
      z-index: 5;
      flex: 0 0 auto;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin: 0;
      padding: 24px 24px 18px;
      background: linear-gradient(180deg, rgba(251,248,243,.98), rgba(251,248,243,.94));
      border-bottom: 1px solid rgba(10,42,94,.08);
      border-radius: 30px 30px 0 0;
      backdrop-filter: blur(14px);
    }

    .modal-head h3 {
      margin: 0;
      color: var(--primary);
      font-size: 19px;
      line-height: 1.2;
      font-weight: 600;
      letter-spacing: -.035em;
    }

    .modal-head p {
      margin: 6px 0 0;
      color: var(--muted);
      font-size: 12.5px;
      line-height: 1.55;
    }

    .modal-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 18px 24px;
      scrollbar-width: thin;
      scrollbar-color: rgba(10,42,94,.22) transparent;
    }

    .modal-actions {
      position: sticky;
      bottom: 0;
      z-index: 5;
      flex: 0 0 auto;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
      margin: 0;
      padding: 18px 24px 24px;
      background: linear-gradient(180deg, rgba(251,248,243,.88), rgba(251,248,243,.98));
      border-top: 1px solid rgba(10,42,94,.08);
      border-radius: 0 0 30px 30px;
      backdrop-filter: blur(14px);
    }

    .modal-actions .btn[data-popup-submit] { min-width: 170px; }

    .creation-popup-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 18px;
      align-items: start;
    }

    .creation-main,
    .creation-side {
      min-width: 0;
      border: 1px solid rgba(10,42,94,.10);
      background: rgba(255,255,255,.58);
      border-radius: 24px;
      padding: 16px;
      box-shadow: var(--inset);
    }

    .creation-side {
      position: sticky;
      top: 0;
      display: grid;
      gap: 12px;
    }

    .creation-section-title {
      margin: 0 0 12px;
      display: flex;
      align-items: center;
      gap: 9px;
      color: var(--primary);
      font-size: 12px;
      font-weight: 620;
      letter-spacing: -.01em;
    }

    .creation-field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .creation-field-grid.one { grid-template-columns: 1fr; }

    .creation-field {
      display: grid;
      gap: 6px;
      min-width: 0;
    }

    .creation-field label {
      color: var(--primary);
      font-size: 11.5px;
      font-weight: 560;
      letter-spacing: -.01em;
    }

    .creation-field .form-control {
      width: 100%;
      min-width: 0;
      height: 42px;
      border-radius: 14px;
      font-size: 12px;
      font-weight: 420;
    }

    .creation-field textarea.form-control { height: 92px; line-height: 1.5; }

    .upload-box {
      min-height: 118px;
      border: 1px dashed rgba(10,42,94,.28);
      border-radius: 20px;
      background: linear-gradient(145deg, rgba(255,255,255,.72), rgba(244,238,230,.72));
      display: grid;
      place-items: center;
      text-align: center;
      padding: 16px;
      color: var(--primary);
      cursor: pointer;
    }

    .upload-box .ui-icon { width: 26px; height: 26px; margin-bottom: 8px; }
    .upload-box strong { display: block; font-size: 12px; font-weight: 570; }
    .upload-box span { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.45; }
    .upload-box.active { border-color: rgba(31,138,91,.42); background: linear-gradient(145deg, rgba(255,255,255,.86), rgba(221,244,232,.72)); }

    .creation-product-preview {
      width: 86px;
      height: 86px;
      border-radius: 28px;
      display: grid;
      place-items: center;
      color: var(--primary);
      background: linear-gradient(145deg, var(--accent), #F8F2EA);
      border: 1px solid rgba(10,42,94,.10);
      box-shadow: var(--shadow-xs), var(--inset);
      overflow: hidden;
    }

    .creation-product-preview .ui-icon { width: 34px; height: 34px; }
    .creation-side h4 { margin: 0; color: var(--primary); font-size: 14px; font-weight: 580; letter-spacing: -.02em; }
    .creation-side p { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }

    .creation-summary-list {
      display: grid;
      gap: 9px;
      margin-top: 4px;
    }

    .creation-summary-list div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid rgba(10,42,94,.08);
      padding-top: 9px;
      color: var(--muted);
      font-size: 11.5px;
    }

    .creation-summary-list strong { color: var(--primary); font-weight: 560; text-align: right; }

    .creation-popup-note {
      padding: 12px;
      border-radius: 18px;
      background: rgba(10,42,94,.055);
      color: var(--muted);
      font-size: 11.5px;
      line-height: 1.5;
    }

    .toast {
      position: fixed;
      right: 22px;
      bottom: 22px;
      z-index: 120;
      width: min(360px, calc(100vw - 44px));
      padding: 14px;
      border-radius: 22px;
      background: rgba(255,255,255,.88);
      border: 1px solid var(--line);
      box-shadow: var(--shadow-sm), var(--inset);
      opacity: 0;
      pointer-events: none;
      transform: translateY(8px);
      transition: opacity .2s ease, transform .2s ease;
    }

    .toast.visible { opacity: 1; transform: translateY(0); }
    .toast h4 { margin: 0; color: var(--primary); font-size: 13px; font-weight: 600; }
    .toast p { margin: 4px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }

    @media (max-width: 820px) {
      .creation-popup-layout { grid-template-columns: 1fr; }
      .creation-side { position: static; }
      .creation-field-grid { grid-template-columns: 1fr; }
    }

    @media (max-width: 760px) {
      .modal-frame { max-height: calc(100vh - 22px); width: min(100%, 96vw); border-radius: 24px; }
      .modal-head { padding: 18px 18px 14px; border-radius: 24px 24px 0 0; }
      .modal-body { padding: 14px 18px; }
      .modal-actions { padding: 14px 18px 18px; border-radius: 0 0 24px 24px; }
      .modal-actions .btn { width: 100%; }
    }
  </style>
</head>
<body>
  <svg aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden;">
    <symbol id="i-products" viewBox="0 0 24 24"><path d="M9.5 14.5 14.5 9.5M7.4 16.6a4.2 4.2 0 0 1 0-5.9l3.3-3.3a4.2 4.2 0 1 1 5.9 5.9l-3.3 3.3a4.2 4.2 0 0 1-5.9 0Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V5M8 9l4-4 4 4M5 16v2.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></symbol>
  </svg>

  <main class="demo-card">
    <h1>Create Product Popup</h1>
    <p>Standalone extraction of the Nevari product creation modal. It keeps the product fields, preview panel, price synchronisation, upload state, sticky header and sticky footer actions.</p>
    <button class="btn btn-primary" type="button" data-popup="product">
      <span class="plus"><svg class="ui-icon" aria-hidden="true"><use href="#i-plus"></use></svg></span>
      Open product popup
    </button>
  </main>

  <div class="rx-live-modal" id="rxLiveModal" aria-hidden="true">
    <article class="modal-frame creation-frame" role="dialog" aria-modal="true" aria-labelledby="rxLiveModalTitle">
      <div class="modal-head">
        <div>
          <h3 id="rxLiveModalTitle">Create product</h3>
          <p id="rxLiveModalText">Add a medicine or pharmacy product with image, stock, pricing, category, expiry and prescription rules.</p>
        </div>
        <button class="btn btn-outline btn-icon" type="button" data-close-live-modal aria-label="Close modal">
          <svg class="ui-icon" aria-hidden="true"><use href="#i-close"></use></svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="creation-popup-layout" data-popup-form="product">
          <div class="creation-main">
            <h4 class="creation-section-title"><svg class="ui-icon" aria-hidden="true"><use href="#i-products"></use></svg> Product information</h4>
            <div class="creation-field-grid">
              <div class="creation-field"><label>Product name</label><input class="form-control" data-summary-target="product-name" value="Paracetamol 500mg" /></div>
              <div class="creation-field"><label>SKU</label><input class="form-control" value="NV-MED-5001" /></div>
              <div class="creation-field"><label>Category</label><select class="form-control" data-summary-target="product-category"><option>Pain relief</option><option>Antibiotics</option><option>Vitamins</option><option>Respiratory</option></select></div>
              <div class="creation-field"><label>Strength or dosage</label><input class="form-control" value="500mg tablet" /></div>
              <div class="creation-field"><label>Unit price</label><input class="form-control" type="number" data-product-price value="6005" /></div>
              <div class="creation-field"><label>Stock quantity</label><input class="form-control" type="number" data-summary-target="product-stock" value="84" /></div>
              <div class="creation-field"><label>Expiry date</label><input class="form-control" type="date" value="2027-12-15" /></div>
              <div class="creation-field"><label>Prescription rule</label><select class="form-control" data-summary-target="product-rx"><option>No prescription needed</option><option>Prescription required</option><option>Pharmacist review required</option></select></div>
            </div>
            <div style="height:14px"></div>
            <div class="creation-field-grid one">
              <div class="creation-field"><label>Product image</label><div class="upload-box" data-upload-box><svg class="ui-icon" aria-hidden="true"><use href="#i-upload"></use></svg><strong>Upload product image</strong><span>The table component will always show this image beside the fixed product name.</span></div></div>
              <div class="creation-field"><label>Description</label><textarea class="form-control">Fever and mild pain relief medicine suitable for standard pharmacy fulfilment.</textarea></div>
            </div>
          </div>
          <aside class="creation-side">
            <div class="creation-product-preview"><svg class="ui-icon" aria-hidden="true"><use href="#i-products"></use></svg></div>
            <div><h4 id="product-name">Paracetamol 500mg</h4><p id="product-category">Pain relief</p></div>
            <div class="creation-summary-list"><div><span>Price</span><strong id="product-price-summary">NGN 6,005.00</strong></div><div><span>Stock</span><strong id="product-stock">84</strong></div><div><span>RX</span><strong id="product-rx">No prescription needed</strong></div></div>
            <div class="creation-popup-note">Product records created here feed the product list table, order creation popup and storefront catalogue.</div>
          </aside>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn btn-outline" type="button" data-popup-close>Save draft</button>
        <button class="btn btn-primary" type="button" data-popup-submit="Product created">Create product</button>
      </div>
    </article>
  </div>

  <div class="toast" id="rxLiveToast" role="status" aria-live="polite">
    <h4 id="rxLiveToastTitle">Updated</h4>
    <p id="rxLiveToastText">The popup state has changed.</p>
  </div>

  <script>
    (function () {
      const liveModal = document.getElementById('rxLiveModal');
      const toast = document.getElementById('rxLiveToast');
      const toastTitle = document.getElementById('rxLiveToastTitle');
      const toastText = document.getElementById('rxLiveToastText');
      let toastTimer;

      function showToast(titleValue, textValue) {
        if (!toast) return;
        toastTitle.textContent = titleValue || 'Updated';
        toastText.textContent = textValue || 'The popup state has changed.';
        toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
      }

      function openPopup() {
        liveModal.classList.add('visible');
        liveModal.setAttribute('aria-hidden', 'false');
      }

      function closePopup() {
        liveModal.classList.remove('visible');
        liveModal.setAttribute('aria-hidden', 'true');
      }

      function bindPopupInteractions() {
        const scope = liveModal;

        scope.querySelectorAll('[data-summary-target]').forEach(input => {
          const apply = () => {
            const target = scope.querySelector('#' + input.dataset.summaryTarget);
            const selectedText = input.options ? input.options[input.selectedIndex]?.textContent : input.value;
            if (target) target.textContent = selectedText || input.value || 'Not set';
          };
          input.addEventListener('input', apply);
          input.addEventListener('change', apply);
          apply();
        });

        scope.querySelectorAll('[data-product-price]').forEach(input => {
          const apply = () => {
            const target = scope.querySelector('#product-price-summary');
            const value = Number(input.value || 0);
            if (target) target.textContent = 'NGN ' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          };
          input.addEventListener('input', apply);
          apply();
        });

        scope.querySelectorAll('[data-upload-box]').forEach(box => {
          box.addEventListener('click', () => {
            box.classList.toggle('active');
            const label = box.querySelector('strong');
            if (label) label.textContent = box.classList.contains('active') ? 'Image selected' : 'Upload product image';
            showToast('Upload preview updated', 'The popup is showing the selected image state.');
          });
        });
      }

      document.querySelectorAll('[data-popup="product"]').forEach(button => {
        button.addEventListener('click', event => {
          event.preventDefault();
          openPopup();
        });
      });

      liveModal.addEventListener('click', event => {
        if (event.target === liveModal || event.target.closest('[data-close-live-modal]') || event.target.closest('[data-popup-close]')) {
          closePopup();
        }

        const submit = event.target.closest('[data-popup-submit]');
        if (submit) {
          showToast(submit.dataset.popupSubmit || 'Product created', 'The product creation popup has been completed in this interactive preview.');
          closePopup();
        }
      });

      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && liveModal.classList.contains('visible')) closePopup();
      });

      bindPopupInteractions();
    })();
  </script>
</body>
</html>