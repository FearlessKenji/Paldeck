#!/usr/bin/env node
const fs = require(`node:fs`);
const path = require(`node:path`);
const { compactItemData, resolvedItemData } = require(`../../utils/itemData.js`);
const { applyTowerBossSources } = require(`../../utils/towerBossSources.js`);

const target = path.resolve(__dirname, `..`, `..`, `data`, `itemData.json`);
const itemData = resolvedItemData(JSON.parse(fs.readFileSync(target, `utf8`)));
const before = JSON.stringify(itemData);
applyTowerBossSources(itemData);
const count = Object.keys(require(`../../data/curatedTowerBossSources.json`)).length;
if (process.argv.includes(`--write`)) {
	fs.writeFileSync(target, `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`);
	console.log(`Applied curated Normal and Hard tower rewards to data/itemData.json.`);
} else if (before !== JSON.stringify(itemData)) {
	console.error(`Tower-reward data is out of sync; run with --write.`);
	process.exitCode = 1;
} else {
	console.log(`Validated ${count} tower-reward cards.`);
}
