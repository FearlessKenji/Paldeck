// Regenerates all curated limited-location item and merchant PNG maps from embedded marker filters.
/* eslint-disable max-statements-per-line -- concise render guards keep record traversal readable. */
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const sharp = require(`sharp`);
const { compactItemData, resolvedItemData } = require(`../utils/itemData.js`);
const { loadMap, renderMap, selectMarkers } = require(`./lib/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const OUTPUT_DIRECTORY = process.env.PALDECK_MAP_OUTPUT_DIR;
const ITEM_DATA_PATH = process.env.PALDECK_ITEM_DATA_PATH || path.join(ROOT, `data`, `itemData.json`);
const MAPS = {
	palpagos: {
		key: `palpagos`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`,
		tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024],
	},
	worldtree: {
		key: `worldtree`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`,
		tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912],
	},
};
const COLORS = {
	'Treasure': `#8b5a2b`, 'Treasure Element': `#facc15`, 'Fishing Spot': `#0ea5e9`,
	'Rare Fishing Spot': `#22d3ee`, 'Junk': `#ec4899`, 'Dungeon': `#ff9600`,
	'Lifmunk Effigy': `#4ade80`, 'Lamball Effigy': `#f5f5f5`, 'Pengullet Effigy': `#38bdf8`,
	'Munchill Effigy': `#2dd4bf`, 'Rooby Effigy': `#f87171`, 'Herbil Effigy': `#f59e0b`,
	'Tanzee Effigy': `#22c55e`, 'Depresso Effigy': `#6366f1`, 'Cattiva Effigy': `#f472b6`,
	'Lunaris Effigy': `#ff5eea`, 'Relaxaurus Effigy': `#ff5eea`, 'Yakumo Effigy': `#ff5eea`,
};

function presentation(filter) {
	const type = filter.type || `Location`;
	let style = filter.style;
	if (!style && type === `Junk`) {style = `density`;}
	if (!style && [`Treasure`, `Treasure Element`].includes(type)) {style = `compact`;}
	if (!style && /cluster/iu.test(type)) {style = `cluster`;}
	if (!style && /dungeon/iu.test(type)) {style = `diamond`;}
	if (!style) {style = `normal`;}
	return { label: filter.label || type, color: COLORS[type] || `#ef4444`, style };
}

function groupsFor(map, filters) {
	const groups = new Map();
	for (const filter of filters) {
		const display = presentation(filter);
		const key = JSON.stringify(display);
		const current = groups.get(key) || { ...display, markers: [] };
		current.markers.push(...selectMarkers(map, [filter]));
		groups.set(key, current);
	}
	return [...groups.values()];
}

async function combinePanels(files, target) {
	const metadata = await Promise.all(files.map(file => sharp(file).metadata()));
	const width = Math.max(...metadata.map(value => value.width));
	const height = metadata.reduce((sum, value) => sum + value.height, 0);
	let top = 0;
	const panels = files.map((file, index) => {
		const panel = { input: file, left: 0, top };
		top += metadata[index].height;
		return panel;
	});
	await sharp({ create: { width, height, channels: 3, background: `#081621` } })
		.composite(panels).png({ compressionLevel: 9 }).toFile(target);
}

async function renderRecord(maps, mapPath, mapSources) {
	const target = OUTPUT_DIRECTORY ? path.join(OUTPUT_DIRECTORY, path.basename(mapPath)) : path.join(ROOT, mapPath);
	if (mapSources.maps?.length) {
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), `paldeck-map-`));
		try {
			const panels = [];
			for (const [index, source] of mapSources.maps.entries()) {
				const panel = path.join(directory, `${index}.png`);
				await renderMap(maps[source.map], groupsFor(maps[source.map], source.markers), panel, source.map === `worldtree`);
				panels.push(panel);
			}
			fs.mkdirSync(path.dirname(target), { recursive: true });
			await combinePanels(panels, target);
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
		return;
	}
	const map = maps[mapSources.map];
	if (map) {await renderMap(map, groupsFor(map, mapSources.markers || []), target, map.key === `worldtree`);}
}

async function main() {
	const requestedIndex = process.argv.indexOf(`--map`);
	const positional = process.argv.slice(2).filter(value => !value.startsWith(`--`) && value !== `write`);
	const requestedMap = requestedIndex >= 0 ? process.argv[requestedIndex + 1] : positional[0] || null;
	const writeData = process.argv.includes(`--write-data`) || process.argv.includes(`write`);
	const sourceData = JSON.parse(fs.readFileSync(ITEM_DATA_PATH, `utf8`));
	const itemData = resolvedItemData(sourceData);
	const maps = Object.fromEntries(await Promise.all(Object.entries(MAPS).map(async ([key, settings]) => [key, await loadMap(settings, CACHE)])));
	const records = new Map();
	for (const item of itemData.Items) {
		for (const value of [item.acquisition, item.merchantLocations, item.medalMerchants]) {
			if (value?.map && value.mapSources && !value.mapSources.chestPools) {records.set(value.map, value.mapSources);}
		}
	}
	for (const value of Object.values(sourceData.MerchantLocationSets || {})) {
		if (value.map && value.mapSources) {records.set(value.map, value.mapSources);}
	}
	for (const [mapPath, sources] of records) {
		if (requestedMap && mapPath !== requestedMap && path.basename(mapPath) !== requestedMap) {continue;}
		await renderRecord(maps, mapPath, sources);
		console.log(`Rendered ${mapPath}`);
	}
	if (requestedMap && ![...records.keys()].some(mapPath => mapPath === requestedMap || path.basename(mapPath) === requestedMap)) {
		throw new Error(`Unknown item map: ${requestedMap}`);
	}
	if (writeData) {
		// Recompact through the shared resolver so generator writes preserve readable, reusable preset references.
		fs.writeFileSync(ITEM_DATA_PATH, `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`);
		console.log(`Updated ${path.relative(ROOT, ITEM_DATA_PATH)}.`);
	}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
