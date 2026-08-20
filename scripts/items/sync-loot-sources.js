// Imports a readable loot-table export for corroboration; decoded local game files remain authoritative.
/* eslint-disable max-statements-per-line -- compact classification guards keep the source taxonomy auditable. */
const fs = require(`node:fs`);
const path = require(`node:path`);
const { compactItemData, resolvedItemData } = require(`../../utils/itemData.js`);
const { decodeHtml, stripTags } = require(`../lib/shared/html-text.js`);
const { fetchCached, fixedLocationMarkers, loadMap, selectMarkers } = require(`../lib/maps/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const ITEM_DATA_PATH = process.env.PALDECK_ITEM_DATA_PATH || path.join(ROOT, `data`, `itemData.json`);
const GAME_SOURCE_DATA = JSON.parse(fs.readFileSync(path.join(ROOT, `data`, `gameSourceData.json`), `utf8`));
const SOURCE_URL = `https://paldb.cc/en/Treasure_Box`;
const MAPS = {
	palpagos: { key: `palpagos`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`, tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024] },
	worldtree: { key: `worldtree`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`, tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912] },
};

const SOURCE_CATEGORY_RULES = [
	[/^Expedition_/iu, `Expeditions`], [/^Salvage_/iu, `Salvage`], [/^Junk_/iu, `Junk`],
	[/_Supply$/iu, `Supply Drops`], [/_Fishing$|_Fishpond$/iu, `Fishing`], [/^EnemyCamp_/iu, `Enemy Camps`],
	[/(?:Electric|Fire|Water)Treasure/iu, `Elemental Chests`], [/Dungeon|Cavern|Sanctuary/iu, `Dungeon Chests`],
	[/_Drop(?:_|$)/iu, `Ground Spawns`], [/^TreasureMap/iu, `Treasure Maps`], [/^Oilrig_/iu, `Oil Rigs`],
	[/^Fruits_/iu, `Skill Fruit Trees`], [/^AncientRelicRecycler_/iu, `Relic Recycler`],
];

function sourceCategory(pool) {
	if (/test/iu.test(pool)) {return null;}
	if (pool === `WorldTree_Drop_HolyWater`) {return `Teafant Springs`;}
	const matchedRule = SOURCE_CATEGORY_RULES.find(([pattern]) => pattern.test(pool));
	if (matchedRule) {return matchedRule[1];}
	if (pool === `PalCapturedCage`) {return `Captured Pal Cages`;}
	const regionalChest = /^(?:Grass|Forest|Desert|Dessert|Volcano|Snow)0[12]$/iu.test(pool) ||
		/^(?:Sakurajima|DarkIsland|SkyIsland|Yakushima|WorldTree)0?2$/iu.test(pool);
	if (/Treasure/iu.test(pool) || regionalChest) {
		return `Treasure Chests`;
	}
	return null;
}

function validateMapFilter({ item, panel, filter, maps }) {
	const locationSet = filter.locationSet && GAME_SOURCE_DATA.fixedLocationSets[filter.locationSet];
	const selected = locationSet ? fixedLocationMarkers(locationSet) : selectMarkers(maps[panel.map], [filter]);
	const problems = [];
	if (!selected.length) {
		problems.push(`${item.name}: map filter ${JSON.stringify(filter)} has no game-derived locations.`);
	} else if (filter.href && sourceCategory(filter.href) && !mappedPoolContains(item, filter.href)) {
		problems.push(`${item.name}: mapped pool ${filter.href} does not contain the item.`);
	}
	return { locations: selected.length, problems };
}

function parseLootPools(html) {
	const byItem = new Map();
	const headingPattern = /<h5 class="card-header">([^<]+?)\s*\/\d+\s*<\/h5>/gu;
	const cards = html.matchAll(new RegExp(
		`${headingPattern.source}([\\s\\S]*?)(?=<div\\s+class='card mb-2|${headingPattern.source}|$)`, `gu`,
	));
	for (const [, rawPool, body] of cards) {
		const pool = stripTags(rawPool);
		const category = sourceCategory(pool);
		if (!category) {continue;}
		const entries = body.matchAll(new RegExp(
			String.raw`<a class="itemname"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>\s*` +
			String.raw`<small class="itemQuantity">([\s\S]*?)<\/small>\s*` +
			String.raw`<span class="float-end">([^<]+)<\/spen>`,
			`gu`,
		));
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
	if (Array.isArray(href)) {return href.every(value => mappedPoolContains(item, value));}
	if (href === `Sakurajima_Treasure`) {
		return item.acquisition.lootPools?.some(pool => [`Sakurajima02`, href].includes(pool.pool));
	}
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
				const result = validateMapFilter({ item, panel, filter, maps });
				problems.push(...result.problems);
				filters += 1;
				locations += result.locations;
			}
		}
	}
	if (problems.length) {throw new Error(`${problems.length} mapped source problem(s):\n${problems.join(`\n`)}`);}
	console.log(`Validated ${locations} fixed locations selected by ${filters} item map filters.`);
}

function applyLootPools(item, lootPools, removedDetails) {
	if (item.category === `Schematic` && Number(item.properties?.bLegalInGame ?? 0) === 0) {
		if (item.acquisition) {
			item.acquisition = JSON.parse(JSON.stringify(item.acquisition));
			delete item.acquisition.lootPools;
			if (!item.acquisition.sources?.length && !item.acquisition.map && !item.acquisition.note) {
				delete item.acquisition;
			}
		}
		return { associations: 0, matched: 0, removed: 0 };
	}
	const pools = lootPools.get(item.detailPath) || [];
	if (!pools.length) {
		if (item.acquisition?.lootPools) {delete item.acquisition.lootPools;}
		return { associations: 0, matched: 0, removed: 0 };
	}
	// Resolved presets may be shared by several items; clone before attaching item-specific pools.
	item.acquisition = item.acquisition ? JSON.parse(JSON.stringify(item.acquisition)) : { sources: [] };
	item.acquisition.lootPools = pools;
	return {
		associations: pools.length,
		matched: 1,
		removed: pruneInvalidCuratedSources(item, removedDetails),
	};
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
		const result = applyLootPools(item, lootPools, removedDetails);
		matchedItems += result.matched;
		associations += result.associations;
		removedCuratedEntries += result.removed;
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
