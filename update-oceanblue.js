const fs = require('fs');
let file = fs.readFileSync('/Users/rahman/Documents/frame30/src/components/builder/oceanblue-final.tsx', 'utf8');

file = file.replace(/row\.featured_media\?\.url/g, "row.imageUrl");
file = file.replace(/row\.handle/g, "row.href ? row.href.split('/').pop() : ''");
file = file.replace(/formatDisplayMoney\(row\.price_minor_int, row\.currency, "en"\)/g, "formatDisplayMoney(row.priceMinor, { currency: row.currency })");

fs.writeFileSync('/Users/rahman/Documents/frame30/src/components/builder/oceanblue-final.tsx', file);
