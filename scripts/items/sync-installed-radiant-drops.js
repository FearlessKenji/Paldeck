#!/usr/bin/env node

// Updates gem sources and removes obsolete explicit level-70 sources without inventing fallback drops.
const fs = require(`node:fs`);
const path = require(`node:path`);
const { steamBuildId } = require(`../../utils/itemAvailabilityAudit.js`);
const pals = require(`../../data/palData.json`).Pals;

function argument(name) {
	const index = process.argv.indexOf(name);
	if (index < 0 || !process.argv[index + 1]) {
		throw new Error(`Required argument: ${name}`);
	}
	return process.argv[index + 1];
}

function readJson(file) {
	return JSON.parse(fs.readFileSync(file, `utf8`));
}

function gemDrops(row) {
	const drops = [];
	for (let slot = 1; slot <= 10; slot += 1) {
		const code = row[`ItemId${slot}`];
		if (!code?.startsWith(`PalAwakening_Material_`) || !(row[`Rate${slot}`] > 0)) {
			continue;
		}
		const minimum = row[`min${slot}`];
		const maximum = row[`Max${slot}`];
		drops.push({
			code: `Items/${code}`,
			quantity: minimum === maximum ? String(minimum) : `${minimum}–${maximum}`,
			probability: `${row[`Rate${slot}`]}%`,
		});
	}
	return drops;
}

function synchronize(items, row) {
	const alpha = row.CharacterID.startsWith(`BOSS_`);
	const id = row.CharacterID.replace(/^BOSS_/u, ``).toLowerCase();
	const pal = pals.find(candidate => candidate.breeding?.id.toLowerCase() === id);
	if (!pal || row.Level !== 70) {
		throw new Error(`Unreviewed source variant: ${row.CharacterID}, level ${row.Level}`);
	}
	const variant = alpha ? `Alpha` : `World Tree`;
	const matches = drop => drop.pal === pal.name && drop.variant === variant && drop.level === row.Level;
	// A table definition alone does not establish availability: require an already published encounter.
	if (!items.some(item => item.droppedBy?.some(matches))) {
		throw new Error(`No published source encounter for ${pal.name} ${variant} ${row.Level}`);
	}
	const expected = gemDrops(row);
	for (const drop of expected) {
		if (!items.some(item => item.code === drop.code)) {
			throw new Error(`Missing item ${drop.code}`);
		}
	}
	for (const item of items.filter(candidate => candidate.code.startsWith(`Items/PalAwakening_Material_`))) {
		item.droppedBy = (item.droppedBy || []).filter(drop => !matches(drop));
		for (const drop of expected.filter(candidate => candidate.code === item.code)) {
			item.droppedBy.push({ pal: pal.name, variant, level: row.Level,
				quantity: drop.quantity, probability: drop.probability });
		}
	}
}

function removeObsoleteSources(items, row, currentRows) {
	const alpha = row.CharacterID.startsWith(`BOSS_`);
	const id = row.CharacterID.replace(/^BOSS_/u, ``).toLowerCase();
	const pal = pals.find(candidate => candidate.breeding?.id.toLowerCase() === id);
	const hasDefault = Object.values(currentRows).some(candidate =>
		candidate.CharacterID === row.CharacterID && candidate.Level === 0);
	if (!pal || row.Level !== 70 || !hasDefault) {
		throw new Error(`Unreviewed removed source: ${row.CharacterID}, level ${row.Level}`);
	}
	const variant = alpha ? `Alpha` : `World Tree`;
	let removed = 0;
	for (const item of items) {
		if (!item.droppedBy) {
			continue;
		}
		const retained = item.droppedBy.filter(drop =>
			!(drop.pal === pal.name && drop.variant === variant && drop.level === row.Level));
		removed += item.droppedBy.length - retained.length;
		item.droppedBy = retained;
	}
	// Only the explicit deleted tier is removed. Default and other-level records remain as published.
	return { pal: pal.name, variant, level: row.Level, removedSources: removed };
}

function main() {
	const snapshot = readJson(argument(`--snapshot`));
	const previous = readJson(argument(`--previous`));
	const installed = steamBuildId(fs.readFileSync(argument(`--steam-manifest`), `utf8`));
	if (String(snapshot.buildId) !== installed || !previous.buildId || previous.buildId === snapshot.buildId) {
		throw new Error(`Expected the installed snapshot and a distinct previous-build snapshot.`);
	}
	const currentRows = snapshot.tables?.palDrops;
	const oldRows = previous.tables?.palDrops;
	if (!Object.keys(currentRows || {}).length || !Object.keys(oldRows || {}).length) {
		throw new Error(`Both snapshots must contain nonempty decoded Pal drop tables.`);
	}
	const file = path.resolve(__dirname, `../../data/itemData.json`);
	const data = readJson(file);
	const changed = Object.keys(currentRows).filter(key => oldRows[key] &&
		JSON.stringify(gemDrops(currentRows[key])) !== JSON.stringify(gemDrops(oldRows[key])));
	for (const key of changed) {
		synchronize(data.Items, currentRows[key]);
	}
	const removed = Object.keys(oldRows).filter(key => !currentRows[key]);
	const added = Object.keys(currentRows).filter(key => !oldRows[key]);
	const removedSources = removed.map(key => ({ row: key,
		...removeObsoleteSources(data.Items, oldRows[key], currentRows) }));
	console.log(JSON.stringify({ buildId: installed, synchronizedRows: changed, removedSources,
		addedRowsRequiringReview: added, write: process.argv.includes(`--write`) }, null, 2));
	if (process.argv.includes(`--write`)) {
		fs.writeFileSync(file, `${JSON.stringify(data, null, `\t`)}\n`);
	}
}

main();
