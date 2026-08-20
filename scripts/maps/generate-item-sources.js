// Renders slab chest and eligible dungeon maps from curated acquisition definitions.
/* eslint-disable max-statements-per-line -- short guard clauses keep this command-line workflow linear. */
const path = require(`node:path`);
const { resolvedItemData } = require(`../../utils/itemData.js`);
const { fetchCached, loadMap, renderMap } = require(`../lib/maps/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const CHEST_CACHE = path.join(ROOT, `tmp`, `item-source-map-cache`);
const OUTPUT_DIRECTORY = process.env.PALDECK_MAP_OUTPUT_DIR;
const MAP = {
	key: `palpagos`,
	script: `https://paldb.cc/js/map_data_en.js?_=1783945617`,
	tileDirectory: `image/map8`,
	crop: [0, 0, 1024, 1024],
};

async function chestLocations(pool) {
	const url = `https://op.gg/palworld/chests/${pool}`;
	const page = (await fetchCached(url, CHEST_CACHE)).toString(`utf8`);
	const match = page.match(/\\"locations\\":\[(.*?)\],\\"markerKind\\"/su);
	if (!match) {throw new Error(`Could not find chest locations for ${pool}.`);}
	return JSON.parse(`[${match[1]}]`.replaceAll(`\\"`, `"`)).map(location => ({
		pos: { X: location.y * 459 - 123888, Y: location.x * 459 + 158000 },
	}));
}

async function main() {
	const requested = process.argv.indexOf(`--item`);
	const positional = process.argv.slice(2).filter(value => !value.startsWith(`--`));
	const itemName = requested >= 0 ? process.argv[requested + 1] : positional.join(` `) || null;
	const map = await loadMap(MAP, CACHE);
	const items = resolvedItemData().Items.filter(item =>
		item.acquisition?.mapSources?.chestPools && (!itemName || item.name.toLowerCase() === itemName.toLowerCase()),
	);
	for (const item of items) {
		const sources = item.acquisition.mapSources;
		const chests = (await Promise.all(sources.chestPools.map(chestLocations))).flat();
		const eligible = new Set(sources.dungeons);
		const dungeons = map.markers.filter(marker => marker.type === `Dungeon` && eligible.has(marker.item));
		await renderMap(map, [
			{ label: `Treasure Chests`, color: `#8b5a2b`, style: `normal`, markers: chests },
			{ label: `Dungeon`, color: `#ff9600`, style: `diamond`, markers: dungeons },
		], OUTPUT_DIRECTORY ? path.join(OUTPUT_DIRECTORY, path.basename(item.acquisition.map)) : path.join(ROOT, item.acquisition.map));
		console.log(`${item.name}: ${chests.length} chest pin(s), ${dungeons.length} dungeon pin(s).`);
	}
	if (itemName && !items.length) {throw new Error(`No legacy mapped acquisition record found for ${itemName}.`);}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
