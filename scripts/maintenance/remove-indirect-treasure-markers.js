#!/usr/bin/env node
const fs = require(`node:fs`);
const path = require(`node:path`);
const { compactItemData, resolvedItemData } = require(`../../utils/itemData.js`);
const { removeIndirectTreasureMapMarkers } = require(`../../utils/itemMapSources.js`);

const target = path.resolve(__dirname, `..`, `..`, `data`, `itemData.json`);
const itemData = resolvedItemData(JSON.parse(fs.readFileSync(target, `utf8`)));
const changed = removeIndirectTreasureMapMarkers(itemData);
if (process.argv.includes(`--write`)) {
	fs.writeFileSync(target, `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`);
	console.log(`Removed indirect Treasure Map markers from ${changed} item cards.`);
} else if (changed) {
	console.error(`${changed} item cards still contain indirect Treasure Map markers.`);
	process.exitCode = 1;
} else {
	console.log(`No non-Treasure Map item cards contain indirect Treasure Map markers.`);
}
