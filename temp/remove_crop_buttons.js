const fs = require('fs'); 
const path = 'NevariAdmin Storefront/app/_customer-dashboard.js'; 
const raw = fs.readFileSync(path, 'utf8'); 
const eol = raw.includes('\r\n') ? '\r\n' : '\n'; 
let text = raw.replace(/\r\n/g, '\n'); 
text = text.replace(/\n\s*\s*<button type=\"button\" className=\"pill-button tertiary customer-profile-cropper-reset\"[\s\S]*?<\/button>/m, ''); 
text = text.replace(/\n\s*\s*<div className=\"customer-profile-upload-actions\">[\s\S]*?<\/div>\n/m, '\n'); 
fs.writeFileSync(path, text.replace(/\n/g, eol)); 
