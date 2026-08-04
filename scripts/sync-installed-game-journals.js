#!/usr/bin/env node

// Builds the searchable journal catalog from installed Note tables and the matching placed map markers.
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const { loadMap } = require(`./lib/item-map-rendering.js`);
const { steamBuildId } = require(`../utils/itemAvailabilityAudit.js`);
const { resolvedItemData } = require(`../utils/itemData.js`);

const ROOT = path.resolve(__dirname, `..`);
const OUTPUT = path.join(ROOT, `data`, `journalData.json`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const MAPS = [
	{ key: `palpagos`, map: `data/item-maps/palpagos-journals.png`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`, tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024] },
	{ key: `worldtree`, map: `data/item-maps/worldtree-journals.png`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`, tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912] },
];

function installedSnapshot() {
	const manifests = [
		process.env.PALWORLD_STEAM_MANIFEST,
		String.raw`B:\SteamLibrary\steamapps\appmanifest_1623730.acf`,
		String.raw`C:\Program Files (x86)\Steam\steamapps\appmanifest_1623730.acf`,
	].filter(Boolean);
	const manifest = manifests.find(candidate => fs.existsSync(candidate));
	if (!manifest) {
		throw new Error(`Palworld Steam manifest not found.`);
	}
	const buildId = steamBuildId(fs.readFileSync(manifest, `utf8`));
	const target = path.join(process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `snapshots`, `items-${buildId}.json`);
	if (!fs.existsSync(target)) {
		throw new Error(`Installed-game snapshot not found: ${target}`);
	}
	return JSON.parse(fs.readFileSync(target, `utf8`));
}

function decodedTable(snapshot, suffix) {
	return Object.entries(snapshot.tables?._decodedTables || {}).find(([name]) => name.endsWith(suffix))?.[1] || {};
}

function normalized(value) {
	return String(value || ``).normalize(`NFKD`).replace(/[’']/gu, ``).replace(/[^a-z0-9]+/giu, ``).toLowerCase();
}

async function main() {
	const snapshot = installedSnapshot();
	const master = decodedTable(snapshot, `/DT_NoteMasterDataTable`);
	const text = decodedTable(snapshot, `/L10N/en/Pal/DataTable/Text/DT_NoteDescText`);
	const journalItems = resolvedItemData().Items.filter(item => item.journalEntry);
	const markers = [];
	for (const definition of MAPS) {
		const mapData = await loadMap(definition, CACHE);
		for (const marker of mapData.markers.filter(value => value.type === `Journals`)) {
			markers.push({ map: definition.map, mapKey: definition.key, marker });
		}
	}
	const journals = Object.entries(master).map(([id, row]) => {
		const raw = text[row.TextId_Description]?.TextData?.LocalizedString || text[id]?.TextData?.LocalizedString || ``;
		const [title, ...body] = raw.replaceAll(`\r`, ``).split(`\n`);
		const placed = markers.find(value => normalized(value.marker.item) === normalized(title));
		const journalItem = journalItems.find(item => normalized(item.journalEntry?.sourceName || item.name) === normalized(title));
		return {
			id, title: title.trim(), description: body.join(`\n`).trim(),
			map: journalItem?.acquisition?.map || placed?.map || null, mapKey: placed?.mapKey || null,
			placed: Boolean(placed),
		};
	}).sort((left, right) => left.title.localeCompare(right.title));
	const output = { buildId: String(snapshot.buildId), generatedAt: new Date().toISOString().slice(0, 10), Journals: journals };
	console.log(`Installed journals: ${journals.length}; placed markers: ${journals.filter(journal => journal.placed).length}.`);
	if (process.argv.includes(`--write`)) {
		fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, `\t`)}\n`);
	}
}

main().catch(error => {
	console.error(error.stack || error);
	process.exitCode = 1;
});
