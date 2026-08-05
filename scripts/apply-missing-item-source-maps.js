#!/usr/bin/env node

// Adds deterministic maps for decoded physical item sources that currently lack acquisition maps.
/* eslint-disable max-statements-per-line -- concise pool-to-marker guards keep the mapping table auditable. */
const crypto = require(`node:crypto`);
const fs = require(`node:fs`);
const path = require(`node:path`);
const { compactItemData, resolvedItemData } = require(`../utils/itemData.js`);

const ROOT = path.resolve(__dirname, `..`);
const ITEM_DATA_PATH = path.join(ROOT, `data`, `itemData.json`);
const CHEST_GRADES = {
	"Regular Chests": 1, "Bronze Key Chests": 2, "Purple Chests": 3,
	"Silver Chests": 4, "Gold Chests": 5, "Gold Key Chests": 6,
};
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

function mapDefinition(item) {
	const pools = item.acquisition?.lootPools || [];
	const palpagos = [];
	const worldtree = [];
	for (const pool of pools) {
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
		if (pool.category === `Fishing` && /_Fishing$/u.test(pool.pool)) {
			if (pool.pool === `WorldTree_Treasure_Fishing`) {
				worldtree.push({ type: `Fishing Spot` }, { type: `Rare Fishing Spot` });
			} else {
				const prefix = pool.pool.replace(/_Fishing$/u, ``);
				const comments = FISHING_COMMENTS_BY_POOL[prefix] || [];
				const common = comments.filter(value => /Common/u.test(value));
				const rare = comments.filter(value => /Rare/u.test(value));
				if (common.length) {palpagos.push({ type: `Fishing Spot`, comment: common });}
				if (rare.length) {palpagos.push({ type: `Rare Fishing Spot`, comment: rare });}
			}
		}
		if (pool.category === `Junk` && pool.pool === `Junk_WorldTree`) {worldtree.push({ type: `Junk` });}
		if (pool.category === `Treasure Chests` && pool.pool === `WorldTree_Treasure`) {
			worldtree.push({ type: `Treasure`, locationSet: `worldTreeTreasureChests` });
		}
	}
	const treasureEntries = (item.acquisition?.sources || []).filter(source => source.type === `Treasure`).flatMap(source => source.entries || []);
	for (const entry of treasureEntries.filter(value => value.lotteryField === `Sakurajima02`)) {
		palpagos.push({
			type: `Treasure`, href: `Sakurajima_Treasure`, lotteryFields: [`Sakurajima02`],
			treasureGrade: CHEST_GRADES[entry.chestTier] || 1,
		});
	}
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

function main() {
	const write = process.argv.includes(`--write`);
	const source = JSON.parse(fs.readFileSync(ITEM_DATA_PATH, `utf8`));
	const itemData = resolvedItemData(source);
	const changed = [];
	for (const item of itemData.Items) {
		const generatedMap = /\/item-sources-[a-f0-9]{12}(?:-|\.png$)/u.test(item.acquisition?.map || ``);
		if (item.searchable === false || (item.acquisition?.map && !generatedMap)) {continue;}
		const definition = mapDefinition(item);
		if (!definition) {continue;}
		const signature = crypto.createHash(`sha256`).update(JSON.stringify(definition)).digest(`hex`).slice(0, 12);
		item.acquisition.map = `data/item-maps/item-sources-${signature}.png`;
		item.acquisition.mapSources = definition;
		changed.push(item.name);
	}
	if (changed.length !== 67) {throw new Error(`Expected 67 missing physical-source maps, found ${changed.length}.`);}
	console.log(changed.join(`\n`));
	console.log(`Prepared ${changed.length} item map assignment(s).`);
	if (write) {
		fs.writeFileSync(ITEM_DATA_PATH, `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`);
		console.log(`Updated ${path.relative(ROOT, ITEM_DATA_PATH)}.`);
	}
}

main();
