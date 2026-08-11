#!/usr/bin/env node
const fs = require(`node:fs`);
const path = require(`node:path`);
const { rawItemData, resolvedItemData } = require(`../utils/itemData.js`);

const root = path.resolve(__dirname, `..`);
const directory = path.join(root, `data`, `item-maps`);
const referenced = new Set();
for (const file of [`palpagos-journals.png`, `worldtree-journals.png`]) {
	referenced.add(path.join(directory, file));
}
const itemData = resolvedItemData();
for (const item of itemData.Items) {
	for (const value of [item.acquisition, item.merchantLocations, item.medalMerchants, item.bountyMerchants, item.arenaMerchant]) {
		if (value?.map) {
			referenced.add(path.resolve(root, value.map));
		}
	}
}
for (const value of Object.values(rawItemData.MerchantLocationSets || {})) {
	if (value?.map) {
		referenced.add(path.resolve(root, value.map));
	}
}
const obsolete = fs.readdirSync(directory).filter(file => file.endsWith(`.png`))
	.map(file => path.join(directory, file)).filter(file => !referenced.has(file));
console.log(`${obsolete.length} unreferenced item-map PNG(s).`);
if (process.argv.includes(`--write`)) {
	for (const file of obsolete) {
		fs.unlinkSync(file);
	}
	console.log(`Removed obsolete generated item maps.`);
} else if (obsolete.length) {
	console.log(`Pass --write to remove them.`);
}
