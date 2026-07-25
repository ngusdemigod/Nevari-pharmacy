const fs = require('fs');
let s1 = fs.readFileSync('NevariAdmin Storefront/app/_customer-dashboard.js', 'utf8');
s1 = s1.replace('originalName.replace(/.[^.]+$/, "")', 'originalName.replace(/\\.[^.]+$/, "")');
fs.writeFileSync('NevariAdmin Storefront/app/_customer-dashboard.js', s1);
let s2 = fs.readFileSync('NevariAdmin Storefront/app/globals.css', 'utf8');
const old = `  .customer-profile-card-head,\r\n  .customer-profile-inline-actions,\r\n  .customer-profile-modal-actions,\r\n  .customer-profile-chip-composer,\r\n  .customer-profile-health-row {\r\n    flex-direction: column;\r\n    align-items: stretch;\r\n  }`;
const neu = `  .customer-profile-card-head,\r\n  .customer-profile-inline-actions,\r\n  .customer-profile-modal-actions,\r\n  .customer-profile-chip-composer,\r\n  .customer-profile-health-row,\r\n  .customer-profile-cropper-toolbar {\r\n    flex-direction: column;\r\n    align-items: stretch;\r\n  }\r\n\r\n  .customer-profile-upload-card {\r\n    width: min(94vw, 640px);\r\n  }\r\n\r\n  .customer-profile-cropper-surface {\r\n    border-radius: 24px;\r\n  }\r\n\r\n  .customer-profile-cropper-hint {\r\n    bottom: 14px;\r\n    padding: 8px 14px;\r\n    font-size: 12px;\r\n  }`;
if (!s2.includes('customer-profile-cropper-toolbar {\r\n    flex-direction: column;')) {
  s2 = s2.replace(old, neu);
}
fs.writeFileSync('NevariAdmin Storefront/app/globals.css', s2);
