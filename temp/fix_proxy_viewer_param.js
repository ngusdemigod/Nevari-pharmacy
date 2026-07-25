const fs = require('fs');
const path = 'NevariAdmin Storefront/app/api/nevari-proxy/route.js';
const raw = fs.readFileSync(path, 'utf8');
const normalized = raw.replace(/\r\n/g, '\n');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const oldValue = '    if (key === "baseUrl" || key === "path" || key === "softFail") {';
const newValue = '    if (key === "baseUrl" || key === "path" || key === "softFail" || key === "_viewer") {';
if (!normalized.includes(oldValue) && !normalized.includes(newValue)) {
  throw new Error('Missing query skip guard');
}
const next = normalized.includes(oldValue) ? normalized.replace(oldValue, newValue) : normalized;
if (next === normalized) {
  throw new Error('No changes made for proxy viewer guard');
}
fs.writeFileSync(path, next.replace(/\n/g, eol));
