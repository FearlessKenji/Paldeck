// Rewrites itemData.json with shared presets while leaving single-use acquisition records inline.
const fs = require(`node:fs`);
const path = require(`node:path`);
const { compactItemData, resolvedItemData } = require(`../utils/itemData.js`);

const target = process.env.PALDECK_ITEM_DATA_PATH || path.resolve(__dirname, `..`, `data`, `itemData.json`);
const source = JSON.parse(fs.readFileSync(target, `utf8`));
const compact = compactItemData(resolvedItemData(source));

// Stable pretty-printing keeps the generated data reviewable while presets remove repeated structures.
fs.writeFileSync(target, `${JSON.stringify(compact, null, `\t`)}\n`);
console.log(`Compacted ${compact.Items.length} items into ${Object.keys(compact.AcquisitionPresets).length} acquisition and ${Object.keys(compact.MerchantLocationSets).length} merchant presets.`);
