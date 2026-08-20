#!/usr/bin/env node

// Adds deterministic, descriptively named maps for decoded physical item sources.
/* eslint-disable max-statements-per-line -- concise pool-to-marker guards keep the mapping table auditable. */
const fs = require(`node:fs`);
const path = require(`node:path`);
const mapGenerationRules = require(`../../data/mapGenerationRules.json`);
const { compactItemData, resolvedItemData } = require(`../../utils/itemData.js`);

const ROOT = path.resolve(__dirname, `..`, `..`);
const ITEM_DATA_PATH = path.join(ROOT, `data`, `itemData.json`);
const CHEST_GRADES = {
	"Regular Chests": 1, "Bronze Key Chests": 2, "Purple Chests": 3,
	"Silver Chests": 4, "Gold Chests": 5, "Gold Key Chests": 6,
};
const MAPPABLE_CHEST_FIELDS = new Set([
	`DarkIsland02`, `DarkIsland_Treasure`, `Desert01`, `Desert02`, `Forest01`, `Forest02`, `Grass01`, `Grass02`,
	`Sakurajima02`, `Snow01`, `Snow02`, `Volcano01`, `Volcano02`,
]);
const OIL_RIG_BOUNDS = {
	Mini: { minX: -290000, maxX: -230000, minY: 210000, maxY: 270000 },
	Normal: { minX: -350000, maxX: -300000, minY: 390000, maxY: 460000 },
	Large: { minX: -830000, maxX: -750000, minY: -660000, maxY: -590000 },
};
const DUNGEONS_BY_POOL = {
	Dessert001: `Cavern of the Dunes`, Forest001: `Mountain Stream Grotto`, Forest002: `Mountain Stream Grotto`,
	Grass001: `Ravine Grotto`, Grass002: `Ravine Grotto`, Sakura001: `Cherry Blossom Cave`,
	Skyland001: `Sunreach Skies`, Snow001: `Astral Mountains Cavern`, Viking001: `Feybreak Cavern`,
	Volcano001: `Volcanic Cavern`, Yakushima001: `???`,
};
const FISHING_COMMENTS_BY_POOL = {
	Grass01: [`A_Common`, `A_Rare`, `A_Rare_Mini`, `B_Common`, `B_Rare`, `B_River_Rare_Mini`],
	Snow01: [`D_Common`, `D_North_River_Common`, `D_North_River_Rare`, `D_North_River_Rare_Mini`, `D_Rare`, `D_SnowMountain_Common`, `D_SnowMountain_Rare`],
	Sakurajima02: [`H_Common`, `H_Ocean_Common`, `H_Ocean_Rare`, `H_Rare`],
	Sakurajima_Treasure: [`H_Common`, `H_Ocean_Common`, `H_Ocean_Rare`, `H_Rare`],
	DarkIsland02: [`I_Common`, `I_Rare`, `I_cold_Common`, `I_cold_Rare`],
};

function unique(values) {
	return [...new Set(values)];
}

function campMarker(pool) {
	const seaBase = pool.match(/^EnemyCamp_(Desert|Grass|Sakurajima|Snow|Volcano|Yamijima)_Seabase/iu)?.[1];
	if (seaBase) {return { type: `Enemy Camp`, RewardName: `SeaBase_${seaBase}_1` };}
	const region = pool.match(/^EnemyCamp_(Desert|Forest|Grass|Sakurajima|Snow|Volcano)/iu)?.[1];
	const reward = { Desert: `Desert1`, Forest: `Forest1`, Grass: `Grass`, Sakurajima: `Sakurajima1`, Snow: `Snow1`, Volcano: `Volcano1` }[region];
	return reward ? { type: `Enemy Camp`, RewardName: reward } : null;
}

function addFishingMarkers(pool, palpagos, worldtree) {
	if (pool.category !== `Fishing` || !/_Fishing$/u.test(pool.pool)) {return;}
	if (pool.pool === `WorldTree_Treasure_Fishing`) {
		worldtree.push({ type: `Fishing Spot` }, { type: `Rare Fishing Spot` });
		return;
	}
	const comments = FISHING_COMMENTS_BY_POOL[pool.pool.replace(/_Fishing$/u, ``)] || [];
	const common = comments.filter(value => /Common/u.test(value));
	const rare = comments.filter(value => /Rare/u.test(value));
	if (common.length) {palpagos.push({ type: `Fishing Spot`, comment: common });}
	if (rare.length) {palpagos.push({ type: `Rare Fishing Spot`, comment: rare });}
}

function addPoolMarkers(pool, palpagos, worldtree) {
	if (pool.category === `Enemy Camps`) {
		const marker = campMarker(pool.pool);
		if (marker) {palpagos.push(marker);}
	}
	if (pool.category === `Oil Rigs`) {
		const rig = pool.pool.includes(`_Large_`) ? `Large` : pool.pool.includes(`_Mini_`) ? `Mini` : `Normal`;
		palpagos.push({ type: `Oilrig Treasure Goal`, bounds: OIL_RIG_BOUNDS[rig] });
	}
	if (pool.category === `Dungeon Chests`) {
		const prefix = pool.pool.match(/^([A-Za-z]+\d{3})_Dungeon/u)?.[1];
		if (DUNGEONS_BY_POOL[prefix]) {palpagos.push({ type: `Dungeon`, item: DUNGEONS_BY_POOL[prefix] });}
	}
	addFishingMarkers(pool, palpagos, worldtree);
	if (pool.category === `Junk` && pool.pool === `Junk_WorldTree`) {worldtree.push({ type: `Junk` });}
	if (pool.category === `Treasure Chests` && pool.pool === `WorldTree_Treasure`) {
		worldtree.push({ type: `Treasure`, locationSet: `worldTreeTreasureChests` });
	}
}

function addChestMarkers(item, palpagos) {
	const entries = (item.acquisition?.sources || [])
		.filter(source => source.type === `Treasure`)
		.flatMap(source => source.entries || [])
		.filter(entry => MAPPABLE_CHEST_FIELDS.has(entry.lotteryField) && entry.chestTier);
	for (const entry of entries) {
		if ([`SkyIsland_Treasure`, `WorldTree_Treasure`].includes(entry.lotteryField)) {continue;}
		palpagos.push({
			type: `Treasure`,
			href: entry.lotteryField === `Sakurajima02` ? `Sakurajima_Treasure` : entry.lotteryField,
			lotteryFields: [entry.lotteryField],
			treasureGrade: CHEST_GRADES[entry.chestTier] || 1,
		});
	}
}

function mapDefinition(item) {
	const pools = item.acquisition?.lootPools || [];
	const palpagos = [];
	const worldtree = [];
	for (const pool of pools) {
		addPoolMarkers(pool, palpagos, worldtree);
	}
	addChestMarkers(item, palpagos);
	const dedupe = markers => [...new Map(markers.map(marker => [JSON.stringify(marker), marker])).values()];
	const panels = [
		{ map: `palpagos`, markers: dedupe(palpagos) },
		{ map: `worldtree`, markers: dedupe(worldtree) },
	].filter(panel => panel.markers.length);
	if (!panels.length) {return null;}
	const unpinnedSources = unique((item.acquisition.sources || []).map(source => source.type).filter(type =>
		type === `Supply` || /^Salvage Rank/u.test(type) || [`Fishing Ponds`, `Mission`].includes(type),
	));
	if (panels.length === 1) {return { ...panels[0], ...(unpinnedSources.length ? { unpinnedSources } : {}) };}
	return { maps: panels, ...(unpinnedSources.length ? { unpinnedSources } : {}) };
}

function mergeDefinitions(existing, derived) {
	const panels = new Map();
	for (const definition of [existing, derived].filter(Boolean)) {
		for (const panel of definition.maps || [definition].filter(value => value.map)) {
			const markers = panels.get(panel.map) || [];
			markers.push(...(panel.markers || []));
			panels.set(panel.map, markers);
		}
	}
	const merged = [...panels].map(([map, markers]) => ({
		map, markers: [...new Map(markers.map(marker => [JSON.stringify(marker), marker])).values()],
	})).filter(panel => panel.markers.length);
	const unpinnedSources = unique([...(existing?.unpinnedSources || []), ...(derived?.unpinnedSources || [])]);
	if (!merged.length) {return null;}
	const result = merged.length === 1 ? merged[0] : { maps: merged };
	if (unpinnedSources.length) {result.unpinnedSources = unpinnedSources;}
	return result;
}

function slug(value) {
	return String(value || ``).toLowerCase().replace(/[^a-z0-9]+/gu, `-`).replace(/^-|-$/gu, ``);
}

function sourceQualifier(type) {
	return mapGenerationRules.naming.sourceQualifiers[type] || slug(type);
}

function mapLabel(definition) {
	const panels = definition.maps || [definition];
	const regions = unique(panels.map(panel => panel.map).filter(Boolean));
	const sources = unique(panels.flatMap(panel => panel.markers || [])
		.map(marker => sourceQualifier(marker.legendType || marker.type || `locations`)));
	return [...regions, ...sources].join(`-`) || `physical-sources`;
}

function commonItemFamily(items) {
	const words = items.map(item => slug(item.name).split(`-`).filter(word => !/^\d+$/u.test(word)));
	const common = words[0]?.filter(word => words.every(parts => parts.includes(word))) || [];
	return common.join(`-`);
}

function definitionQualifier(definition) {
	const panels = definition.maps || [definition];
	const values = panels.flatMap(panel => (panel.markers || []).flatMap(marker =>
		Object.entries(marker)
			.filter(([key, value]) => ![`type`, `legendType`, `style`, `color`, `bounds`].includes(key) &&
				[`string`, `number`].includes(typeof value))
			.map(([, value]) => slug(value)),
	));
	return unique(values.filter(Boolean)).slice(0, 4).join(`-`);
}

function readableMapPaths(definitions, assignments) {
	const paths = new Map();
	const claimed = new Map();
	for (const encoded of [...definitions].sort()) {
		const definition = JSON.parse(encoded);
		const items = assignments.filter(value => value.encoded === encoded).map(value => value.item);
		const family = items.length === 1 ? slug(items[0].name) : commonItemFamily(items);
		const suffix = items.length === 1 ? mapGenerationRules.naming.singleItemSuffix : mapGenerationRules.naming.sharedMapSuffix;
		const label = family || mapLabel(definition);
		let mapPath = `${mapGenerationRules.naming.directory}/${label}-${suffix}.png`;
		if (claimed.has(mapPath) && items.length > 1 && family) {
			mapPath = `${mapGenerationRules.naming.directory}/${mapLabel(definition)}-${family}-${suffix}.png`;
		}
		if (claimed.has(mapPath)) {
			const qualifier = definitionQualifier(definition);
			mapPath = `${mapGenerationRules.naming.directory}/${mapLabel(definition)}${qualifier ? `-${qualifier}` : ``}-${suffix}.png`;
		}
		if (claimed.has(mapPath)) {
			throw new Error(`Map filename collision for ${mapPath}; add a descriptive family naming rule.`);
		}
		claimed.set(mapPath, encoded);
		paths.set(encoded, mapPath);
	}
	return paths;
}

function readableMerchantMapPath(locations) {
	const shops = (locations.mapSources?.markers || [])
		.map(marker => slug(marker.href || marker.shop || `unknown-shop`))
		.sort();
	return shops.length ? `data/item-maps/merchant-locations-${shops.join(`-and-`)}.png` : locations.map;
}

function migrateMapAsset(previousMap, nextMap) {
	if (!previousMap || !nextMap || previousMap === nextMap) {
		return;
	}
	const previousPath = path.join(ROOT, previousMap);
	const nextPath = path.join(ROOT, nextMap);
	if (fs.existsSync(previousPath) && !fs.existsSync(nextPath)) {
		fs.copyFileSync(previousPath, nextPath);
	}
}

function writeItemData(itemData) {
	const output = `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`;
	for (let attempt = 0; attempt < 12; attempt += 1) {
		try {
			fs.writeFileSync(ITEM_DATA_PATH, output);
			return;
		} catch (error) {
			if (attempt === 11) {throw error;}
			// Antivirus and preview readers can hold the large JSON briefly on Windows.
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
		}
	}
}

function migrateMerchantMaps(items, write) {
	for (const item of items) {
		if (!item.merchantLocations?.mapSources?.markers?.length) {continue;}
		const previousMap = item.merchantLocations.map;
		item.merchantLocations.map = readableMerchantMapPath(item.merchantLocations);
		if (write) {migrateMapAsset(previousMap, item.merchantLocations.map);}
	}
}

function mapAssignments(items, rebuildAll) {
	const assignments = [];
	const definitions = new Set();
	for (const item of items) {
		const generatedMap = /\/item-sources-[a-f0-9]{12}(?:-|\.png$)/u.test(item.acquisition?.map || ``);
		if (item.searchable === false || (!rebuildAll && item.acquisition?.map && !generatedMap)) {continue;}
		const derived = mapDefinition(item);
		const definition = rebuildAll ? mergeDefinitions(item.acquisition?.mapSources, derived) : derived;
		if (!definition) {continue;}
		const encoded = JSON.stringify(definition);
		definitions.add(encoded);
		assignments.push({ definition, encoded, item, previousMap: item.acquisition?.map });
	}
	return { assignments, definitions };
}

function applyMapAssignments(assignments, mapPaths, write) {
	const changed = [];
	for (const { definition, encoded, item, previousMap } of assignments) {
		item.acquisition.map = mapPaths.get(encoded);
		item.acquisition.mapSources = definition;
		changed.push(item.name);
		if (write) {migrateMapAsset(previousMap, item.acquisition.map);}
	}
	return changed;
}

function main() {
	const write = process.argv.includes(`--write`);
	const source = JSON.parse(fs.readFileSync(ITEM_DATA_PATH, `utf8`));
	const itemData = resolvedItemData(source);
	const rebuildAll = process.argv.includes(`--all`);
	migrateMerchantMaps(itemData.Items, write);
	const { assignments, definitions } = mapAssignments(itemData.Items, rebuildAll);
	const mapPaths = readableMapPaths(definitions, assignments);
	const changed = applyMapAssignments(assignments, mapPaths, write);
	console.log(changed.join(`\n`));
	console.log(`Prepared ${changed.length} item map assignment(s).`);
	if (write) {
		writeItemData(itemData);
		console.log(`Updated ${path.relative(ROOT, ITEM_DATA_PATH)}.`);
	}
}

main();
