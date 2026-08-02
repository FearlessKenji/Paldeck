// Imports a readable loot-table export for corroboration; decoded local game files remain authoritative.
/* eslint-disable max-statements-per-line -- compact classification guards keep the source taxonomy auditable. */
const fs = require(`node:fs`);
const path = require(`node:path`);
const { compactItemData, resolvedItemData } = require(`../utils/itemData.js`);
const { decodeHtml, stripTags } = require(`./lib/html-text.js`);
const { fetchCached, fixedLocationMarkers, loadMap, selectMarkers } = require(`./lib/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const ITEM_DATA_PATH = process.env.PALDECK_ITEM_DATA_PATH || path.join(ROOT, `data`, `itemData.json`);
const GAME_SOURCE_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, `data`, `gameSourceData.json`), `utf8`));
const SOURCE_URL = `https://paldb.cc/en/Treasure_Box`;
const MAPS = {
	palpagos: { key: `palpagos`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`, tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024] },
	worldtree: { key: `worldtree`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`, tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912] },
};

function sourceCategory(pool) {
	if (/test/iu.test(pool)) {return null;}
	if (/^Expedition_/iu.test(pool)) {return `Expeditions`;}
	if (/^Salvage_/iu.test(pool)) {return `Salvage`;}
	if (/^Junk_/iu.test(pool)) {return `Junk`;}
	if (/_Supply$/iu.test(pool)) {return `Supply Drops`;}
	if (/_Fishing$|_Fishpond$/iu.test(pool)) {return `Fishing`;}
	if (/^EnemyCamp_/iu.test(pool)) {return `Enemy Camps`;}
	if (/(?:Electric|Fire|Water)Treasure/iu.test(pool)) {return `Elemental Chests`;}
	if (/Dungeon|Cavern|Sanctuary/iu.test(pool)) {return `Dungeon Chests`;}
	if (/_Drop(?:_|$)/iu.test(pool)) {return `Ground Spawns`;}
	if (/^TreasureMap/iu.test(pool)) {return `Treasure Maps`;}
	if (/^Oilrig_/iu.test(pool)) {return `Oil Rigs`;}
	if (/^Fruits_/iu.test(pool)) {return `Skill Fruit Trees`;}
	if (/^AncientRelicRecycler_/iu.test(pool)) {return `Relic Recycler`;}
	if (pool === `PalCapturedCage`) {return `Captured Pal Cages`;}
	if (/Treasure|^(?:Grass|Forest|Desert|Dessert|Volcano|Snow)0[12]$|^(?:Sakurajima|DarkIsland|SkyIsland|Yakushima|WorldTree)0?2$/iu.test(pool)) {
		return `Treasure Chests`;
	}
	return null;
}

function parseLootPools(html) {
	const byItem = new Map();
	const cards = html.matchAll(/<h5 class="card-header">([^<]+?)\s*\/\d+\s*<\/h5>([\s\S]*?)(?=<div\s+class='card mb-2|<h5 class="card-header">|$)/gu);
	for (const [, rawPool, body] of cards) {
		const pool = stripTags(rawPool);
		const category = sourceCategory(pool);
		if (!category) {continue;}
		const entries = body.matchAll(/<a class="itemname"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>\s*<small class="itemQuantity">([\s\S]*?)<\/small>\s*<span class="float-end">([^<]+)<\/spen>/gu);
		for (const [, href, rawQuantity, rawProbability] of entries) {
			const probability = decodeHtml(rawProbability).trim();
			if (Number.parseFloat(probability) === 0) {continue;}
			const itemPools = byItem.get(href) || [];
			itemPools.push({ pool, category, quantity: stripTags(rawQuantity), probability });
			byItem.set(href, itemPools);
		}
	}
	return byItem;
}

function mappedPoolContains(item, href) {
	const elementalRegion = href.match(/^Treasure_Element_(.+)$/u)?.[1];
	if (elementalRegion) {
		const pattern = new RegExp(`^${elementalRegion}_(?:Electric|Fire|Water)Treasure$`, `u`);
		return item.acquisition.lootPools?.some(pool => pattern.test(pool.pool));
	}
	return item.acquisition.lootPools?.some(pool => pool.pool === href);
}

function curatedEntryMatches(item, sourceType, location) {
	const pools = item.acquisition.lootPools || [];
	if (sourceType === `Treasure`) {
		const namedPools = {
			'76 Sunreach chest locations': `SkyIsland_Treasure`,
			'38 World Tree chest locations': `WorldTree_Treasure`,
		};
		const poolName = namedPools[location] || location.replaceAll(` `, `_`);
		return pools.some(pool => pool.pool === poolName);
	}
	if (sourceType === `Treasure Element`) {
		const region = location.match(/^Treasure Element (.+)$/u)?.[1];
		return !region || pools.some(pool => new RegExp(`^${region}_(?:Electric|Fire|Water)Treasure$`, `u`).test(pool.pool));
	}
	if (sourceType === `Supply`) {return pools.some(pool => pool.pool === location.replaceAll(` `, `_`));}
	if (sourceType === `Junk`) {return pools.some(pool => pool.pool === location.replace(/^Junk /u, `Junk_`));}
	if (sourceType === `World Tree Junk`) {return pools.some(pool => pool.pool === `Junk_WorldTree`);}
	if (/^Salvage Rank[12]$/u.test(sourceType)) {return pools.some(pool => pool.pool === sourceType.replace(` `, `_`));}
	return true;
}

function pruneInvalidCuratedSources(item, removedDetails) {
	let removed = 0;
	item.acquisition.sources = (item.acquisition.sources || []).flatMap(source => {
		const entries = source.entries.filter(entry => {
			const valid = curatedEntryMatches(item, source.type, entry.location);
			if (!valid) {removedDetails.push(`${item.name}: ${source.type} / ${entry.location}`);}
			return valid;
		});
		removed += source.entries.length - entries.length;
		return entries.length ? [{ ...source, entries }] : [];
	});
	return removed;
}

async function validateMappedLocations(itemData) {
	const maps = Object.fromEntries(await Promise.all(Object.entries(MAPS).map(async ([key, settings]) =>
		[key, await loadMap(settings, CACHE)],
	)));
	let filters = 0;
	let locations = 0;
	const problems = [];
	for (const item of itemData.Items) {
		const sources = item.acquisition?.mapSources;
		const panels = sources?.maps || (sources?.map ? [sources] : []);
		for (const panel of panels) {
			for (const filter of panel.markers || []) {
				const locationSet = filter.locationSet && GAME_SOURCE_DATA.fixedLocationSets[filter.locationSet];
				const selected = locationSet ? fixedLocationMarkers(locationSet) : selectMarkers(maps[panel.map], [filter]);
				if (!selected.length) {
					problems.push(`${item.name}: map filter ${JSON.stringify(filter)} has no game-derived locations.`);
					continue;
				}
				if (filter.href && sourceCategory(filter.href) && !mappedPoolContains(item, filter.href)) {
					problems.push(`${item.name}: mapped pool ${filter.href} does not contain the item.`);
				}
				filters += 1;
				locations += selected.length;
			}
		}
	}
	if (problems.length) {throw new Error(`${problems.length} mapped source problem(s):\n${problems.join(`\n`)}`);}
	console.log(`Validated ${locations} fixed locations selected by ${filters} item map filters.`);
}

async function main() {
	const write = process.argv.includes(`--write`);
	const html = (await fetchCached(SOURCE_URL, CACHE)).toString(`utf8`);
	const lootPools = parseLootPools(html);
	const sourceData = JSON.parse(fs.readFileSync(ITEM_DATA_PATH, `utf8`));
	const itemData = resolvedItemData(sourceData);
	let matchedItems = 0;
	let associations = 0;
	let removedCuratedEntries = 0;
	const removedDetails = [];
	for (const item of itemData.Items) {
		const pools = lootPools.get(item.detailPath) || [];
		if (pools.length) {
			// Resolved presets may be shared by several items; clone before attaching item-specific pools.
			item.acquisition = item.acquisition ? JSON.parse(JSON.stringify(item.acquisition)) : { sources: [] };
			item.acquisition.lootPools = pools;
			matchedItems += 1;
			associations += pools.length;
			removedCuratedEntries += pruneInvalidCuratedSources(item, removedDetails);
		} else if (item.acquisition?.lootPools) {
			delete item.acquisition.lootPools;
		}
	}
	if (matchedItems < 700 || associations < 8000) {
		throw new Error(`Loot source extraction was unexpectedly incomplete.`);
	}
	await validateMappedLocations(itemData);
	console.log(`Validated ${associations} obtainable loot-pool associations across ${matchedItems} item records.`);
	console.log(`Removed ${removedCuratedEntries} curated source entries contradicted by the loot table.`);
	if (removedDetails.length) {console.log(removedDetails.join(`\n`));}
	if (!write) {
		console.log(`Dry run complete. Use --write to update item data.`);
		return;
	}
	fs.writeFileSync(ITEM_DATA_PATH, `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`);
	console.log(`Updated ${path.relative(ROOT, ITEM_DATA_PATH)}.`);
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
