const fs = require('fs');
const path = 'D:/dev/nevari-pharmacy-core/NevariAdmin Storefront/app/_customer-dashboard.js';
let text = fs.readFileSync(path, 'utf8');

const replacements = [
  {
    oldText: ,
    newText: 
  },
  {
    oldText: ,
    newText: 
  },
  {
    oldText: ,
    newText: 
  },
  {
    oldText: ,
    newText: 
  },
  {
    oldText: ,
    newText: 
  },
  {
    oldText: ,
    newText: 
  },
  {
    oldText: ,
    newText: 
  }
];

for (const replacement of replacements) {
  if (!text.includes(replacement.oldText)) {
    throw new Error('Target snippet not found during avatar refresh patch.');
  }
  text = text.replace(replacement.oldText, replacement.newText);
}

fs.writeFileSync(path, text);
