// Generates dedicated encounter-location maps from the same tower markers used by item source maps.
const path = require(`node:path`);
const { curatedTowerBossMarkers } = require(`../../utils/towerBossSources.js`);
const { itemSourcePresentation, loadMap, renderMap, selectMarkers } = require(`../lib/maps/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const OUTPUT = path.join(ROOT, `data`, `encounter-maps`);
const MAPS = {
	palpagos: { key: `palpagos`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`, tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024] },
	worldtree: { key: `worldtree`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`, tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912] },
};
const FILES_BY_BOSS_TYPE = {
	GrassBoss: `zoe-grizzbolt.png`, ForestBoss: `lily-lyleen.png`, ElectricBoss: `axel-orserk.png`,
	DesertBoss: `marcus-faleris.png`, SnowBoss: `victor-shadowbeak.png`, SakurajimaBoss: `saya-selyne.png`,
	VikingBoss: `bjorn-bastigor.png`, SorajimaBoss: `auri-shaolong.png`, WorldTreeBoss: `zenara-astralym.png`,
};

function markerGroup(map, filter) {
	const markers = selectMarkers(map, [filter]);
	if (markers.length !== 1) {
		throw new Error(`Expected exactly one ${filter.legendType || filter.type} marker, found ${markers.length}.`);
	}
	return { ...itemSourcePresentation(filter), markers, sourceType: filter.legendType || filter.type };
}

async function main() {
	const loadedMaps = await Promise.all(Object.entries(MAPS)
		.map(async ([key, value]) => [key, await loadMap(value, CACHE)]));
	const maps = Object.fromEntries(loadedMaps);
	for (const [bossType, config] of Object.entries(curatedTowerBossMarkers)) {
		const map = maps[config.map];
		await renderMap(map, [markerGroup(map, config.marker)], path.join(OUTPUT, FILES_BY_BOSS_TYPE[bossType]), config.map === `worldtree`);
	}
	const panthalusFilter = { type: `Fast Travel`, item: `Deserted Islet`, legendType: `Story Boss` };
	await renderMap(maps.palpagos, [markerGroup(maps.palpagos, panthalusFilter)], path.join(OUTPUT, `panthalus.png`));
	console.log(`Rendered ${Object.keys(FILES_BY_BOSS_TYPE).length + 1} encounter-location maps.`);
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
