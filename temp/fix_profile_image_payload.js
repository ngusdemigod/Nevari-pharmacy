const fs = require('fs');
const path = 'NevariAdmin Storefront/app/_customer-dashboard.js';
const raw = fs.readFileSync(path, 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
let content = raw.replace(/\r\n/g, '\n');

function replaceAllOrThrow(oldText, newText, expectedCount, label) {
  const count = content.split(oldText).length - 1;
  if (count !== expectedCount) {
    throw new Error(`${label}: expected ${expectedCount}, found ${count}`);
  }
  content = content.split(oldText).join(newText);
}

replaceAllOrThrow(
  '      const payload = preparedUpload || {\n        filename: file.name,\n        mime_type: file.type,\n        data_base64: await readFileAsBase64(file),\n      };',
  '      const payload = preparedUpload\n        ? {\n            filename: preparedUpload.filename,\n            mime_type: preparedUpload.mime_type,\n            data_base64: preparedUpload.data_base64,\n          }\n        : {\n            filename: file.name,\n            mime_type: file.type,\n            data_base64: await readFileAsBase64(file),\n          };',
  2,
  'payload replacement'
);

fs.writeFileSync(path, content.replace(/\n/g, eol));
