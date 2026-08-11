// Regenerates all curated limited-location item and merchant PNG maps from embedded marker filters.
/* eslint-disable max-statements-per-line -- concise render guards keep record traversal readable. */
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const sharp = require(`sharp`);
const { compactItemData, resolvedItemData } = require(`../utils/itemData.js`);
const {
	fixedLocationMarkers, itemSourcePresentation, loadMap, renderMap, selectMarkers, writeOutput,
} = require(`./lib/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const OUTPUT_DIRECTORY = process.env.PALDECK_MAP_OUTPUT_DIR;
const ITEM_DATA_PATH = process.env.PALDECK_ITEM_DATA_PATH || path.join(ROOT, `data`, `itemData.json`);
const GAME_SOURCE_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, `data`, `gameSourceData.json`), `utf8`));
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
function presentation(filter) {
	return itemSourcePresentation(filter);
}

function groupsFor(map, filters) {
	const groups = new Map();
	for (const filter of filters) {
		const display = presentation(filter);
		const key = JSON.stringify(display);
		const current = groups.get(key) || { ...display, markers: [] };
		const locationSet = filter.locationSet && GAME_SOURCE_DATA.fixedLocationSets[filter.locationSet];
		if (filter.locationSet && !locationSet) {throw new Error(`Unknown fixed location set: ${filter.locationSet}`);}
		current.markers.push(...(locationSet ? fixedLocationMarkers(locationSet) : selectMarkers(map, [filter])));
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
	const output = await sharp({ create: { width, height, channels: 3, background: `#081621` } })
		.composite(panels).png({ compressionLevel: 9 }).toBuffer();
	writeOutput(target, output);
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

function commandOptions() {
	const indexOf = option => process.argv.indexOf(option);
	const requestedIndex = indexOf(`--map`);
	const sourceTypeIndex = indexOf(`--source-type`);
	const fromIndex = indexOf(`--from`);
	const positional = process.argv.slice(2).filter(value => !value.startsWith(`--`) && value !== `write`);
	return {
		regionalChestsOnly: process.argv.includes(`--regional-chests`),
		missingOnly: process.argv.includes(`--missing`),
		requestedMap: requestedIndex >= 0 ? process.argv[requestedIndex + 1] : sourceTypeIndex < 0 ? positional[0] || null : null,
		requestedSourceType: sourceTypeIndex >= 0 ? process.argv[sourceTypeIndex + 1] : null,
		requestedFrom: fromIndex >= 0 ? process.argv[fromIndex + 1] : null,
		writeData: process.argv.includes(`--write-data`) || process.argv.includes(`write`),
	};
}

function shouldCollectRecord(value, regionalChestsOnly) {
	if (!value?.map || !value.mapSources || value.mapSources.chestPools) {return false;}
	const regionalChest = value.lootPools?.some(pool =>
		[`SkyIsland_Treasure`, `WorldTree_Treasure`].includes(pool.pool));
	return !regionalChestsOnly || regionalChest;
}

function collectRecords(itemData, sourceData, regionalChestsOnly) {
	const records = new Map();
	for (const item of itemData.Items) {
		for (const value of [item.acquisition, item.merchantLocations, item.medalMerchants, item.bountyMerchants, item.arenaMerchant]) {
			if (shouldCollectRecord(value, regionalChestsOnly)) {
				records.set(value.map, value.mapSources);
			}
		}
	}
	if (!regionalChestsOnly) {
		for (const value of Object.values(sourceData.MerchantLocationSets || {})) {
			if (value.map && value.mapSources) {records.set(value.map, value.mapSources);}
		}
	}
	return records;
}

function recordMatches(mapPath, sources, options, reachedStart) {
	if (!reachedStart) {return false;}
	if (options.requestedMap && mapPath !== options.requestedMap && path.basename(mapPath) !== options.requestedMap) {
		return false;
	}
	const panels = sources.maps?.length ? sources.maps : [sources];
	const includesSource = panels.some(panel =>
		panel.markers?.some(marker => (marker.legendType || marker.type) === options.requestedSourceType));
	if (options.requestedSourceType && !includesSource) {return false;}
	return !options.missingOnly || !fs.existsSync(path.join(ROOT, mapPath));
}

async function renderRecords(records, maps, options) {
	const failures = [];
	let reachedStart = !options.requestedFrom;
	for (const [mapPath, sources] of records) {
		if (!reachedStart && (mapPath === options.requestedFrom || path.basename(mapPath) === options.requestedFrom)) {
			reachedStart = true;
		}
		if (!recordMatches(mapPath, sources, options, reachedStart)) {continue;}
		try {
			await renderRecord(maps, mapPath, sources);
			console.log(`Rendered ${mapPath}`);
		} catch (error) {
			failures.push({ error, mapPath, sources });
			console.warn(`Deferred ${mapPath}: ${error.message || error}`);
		}
	}
	if (options.requestedFrom && !reachedStart) {
		throw new Error(`Unknown starting item map: ${options.requestedFrom}`);
	}
	return failures;
}

async function retryFailures(failures, maps) {
	let pending = failures;
	for (let round = 1; pending.length && round <= 5; round += 1) {
		const next = [];
		for (const failure of pending) {
			try {
				await renderRecord(maps, failure.mapPath, failure.sources);
				console.log(`Rendered ${failure.mapPath} on retry ${round}.`);
			} catch (error) {
				next.push({ ...failure, error });
			}
		}
		pending = next;
	}
	if (pending.length) {
		throw new Error(`Could not write ${pending.length} item map(s) after deferred retries: ${pending.map(value => value.mapPath).join(`, `)}`);
	}
}

function validateRequests(records, { requestedMap, requestedSourceType }) {
	if (requestedMap && ![...records.keys()].some(mapPath =>
		mapPath === requestedMap || path.basename(mapPath) === requestedMap)) {
		throw new Error(`Unknown item map: ${requestedMap}`);
	}
	const includesSource = [...records.values()].some(sources => (sources.maps?.length ? sources.maps : [sources])
		.some(panel => panel.markers?.some(marker => (marker.legendType || marker.type) === requestedSourceType)));
	if (requestedSourceType && !includesSource) {
		throw new Error(`Unknown item-map source type: ${requestedSourceType}`);
	}
}

async function main() {
	const options = commandOptions();
	const sourceData = JSON.parse(fs.readFileSync(ITEM_DATA_PATH, `utf8`));
	const itemData = resolvedItemData(sourceData);
	const loadedMaps = await Promise.all(
		Object.entries(MAPS).map(async ([key, settings]) => [key, await loadMap(settings, CACHE)]),
	);
	const maps = Object.fromEntries(loadedMaps);
	const records = collectRecords(itemData, sourceData, options.regionalChestsOnly);
	await retryFailures(await renderRecords(records, maps, options), maps);
	validateRequests(records, options);
	if (options.writeData) {
		// Recompact through the shared resolver so generator writes preserve readable, reusable preset references.
		fs.writeFileSync(ITEM_DATA_PATH, `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`);
		console.log(`Updated ${path.relative(ROOT, ITEM_DATA_PATH)}.`);
	}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
