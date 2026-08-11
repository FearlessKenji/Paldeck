// Corroborates Pal habitat sources against PalDB's readable distribution and fixed-encounter exports.

const fs = require(`node:fs`);
const path = require(`node:path`);
const { fetchCached, parseJsonVariable } = require(`./lib/item-map-rendering.js`);
const { curatedPalHabitats } = require(`../utils/curatedPalHabitats.js`);

const ROOT = path.resolve(__dirname, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const UNKNOWN = `data/maps/unknown-habitat.png`;
const DISTRIBUTION_URL = `https://paldb.cc/DataTable/UI/DT_PaldexDistributionData.json?_=1730258749`;
const MAPS = [
	{ key: `Palpagos`, url: `https://paldb.cc/js/map_data_en.js?_=1783945617` },
	{ key: `World Tree`, url: `https://paldb.cc/js/treemap_data_en.js?_=1783945617` },
];
const SHARED_HABITATS = new Map([
	// Necromus and Paladius are encountered together at Paladius's fixed Alpha location.
	[`necromus`, `data/maps/198-paladius.png`],
]);

function slug(value) {
	return value.toLowerCase().replaceAll(`&`, `and`).replace(/[^a-z0-9]+/gu, `-`).replace(/^-|-$/gu, ``);
}

function locationCount(row) {
	return (row?.dayTimeLocations?.Locations?.length || 0) + (row?.nightTimeLocations?.Locations?.length || 0);
}

function expectedHabitat(pal, hasLocations, curated) {
	if (curated[pal.name]) {
		return `data/maps/${curated[pal.name].file}`;
	}
	const shared = SHARED_HABITATS.get(pal.name.toLowerCase());
	if (shared) {
		return shared;
	}
	if (!hasLocations) {
		return UNKNOWN;
	}
	const prefix = pal.number.toLowerCase() === `-1` ? `terraria` : pal.number.toLowerCase();
	return `data/maps/${prefix}-${slug(pal.name)}.png`;
}

function auditPal({ pal, rowsById, maps, curated }) {
	const problems = [];
	const code = String(pal.breeding?.id || ``).toLowerCase();
	if (!code) {
		return { problems: [`${pal.name}: missing canonical internal Pal ID.`], distributed: 0, alphaPals: 0, alphaMarkers: 0, unknown: 0 };
	}
	const distributed = locationCount(rowsById.get(code)) > 0;
	const ids = new Set([code, `boss_${code}`]);
	const matchingMarkers = maps.flatMap(map =>
		map.markers.filter(marker => marker.pos && ids.has(String(marker.id || ``).toLowerCase())));
	const alphaMarkers = matchingMarkers.filter(marker => marker.type === `Alpha Pal`);
	const forbidden = matchingMarkers.filter(marker => marker.type !== `Alpha Pal`);
	if (forbidden.length) {
		const types = [...new Set(forbidden.map(marker => marker.type))].join(`, `);
		problems.push(`${pal.name}: non-Alpha fixed markers would contaminate its habitat map (${types}).`);
	}
	const expected = expectedHabitat(pal, distributed || alphaMarkers.length > 0, curated);
	if (pal.habitat !== expected) {
		problems.push(`${pal.name}: habitat is ${pal.habitat || `(missing)`}; expected ${expected}.`);
	}
	if (expected !== UNKNOWN && !fs.existsSync(path.join(ROOT, expected))) {
		problems.push(`${pal.name}: habitat image does not exist at ${expected}.`);
	}
	return {
		problems,
		distributed: Number(distributed),
		alphaPals: Number(alphaMarkers.length > 0),
		alphaMarkers: alphaMarkers.length,
		unknown: Number(expected === UNKNOWN),
	};
}

async function main() {
	const pals = require(`../data/palData.json`).Pals.filter(pal => !pal.hidden);
	const distributionPayload = await fetchCached(DISTRIBUTION_URL, CACHE);
	const distribution = JSON.parse(distributionPayload.toString(`utf8`))[0].Rows;
	const rowsById = new Map(Object.entries(distribution).map(([id, row]) => [id.toLowerCase(), row]));
	const maps = await Promise.all(MAPS.map(async map => ({
		...map,
		markers: parseJsonVariable((await fetchCached(map.url, CACHE)).toString(`utf8`), `fixedDungeon`),
	})));
	const problems = [];
	const curated = curatedPalHabitats(pals);
	let distributionPals = 0;
	let fixedAlphaPals = 0;
	let unknownHabitats = 0;
	let fixedAlphaMarkers = 0;

	for (const pal of pals) {
		const result = auditPal({ pal, rowsById, maps, curated });
		problems.push(...result.problems);
		distributionPals += result.distributed;
		fixedAlphaPals += result.alphaPals;
		fixedAlphaMarkers += result.alphaMarkers;
		unknownHabitats += result.unknown;
	}

	console.log(
		`Audited ${pals.length} visible Pals: ${distributionPals} have day/night distributions, ` +
		`${fixedAlphaPals} have ${fixedAlphaMarkers} fixed Alpha markers, and ${unknownHabitats} have no mappable habitat.`,
	);
	console.log(`Caged and incident Pal sources are excluded; only game-derived distributions and Alpha Pal markers are eligible.`);
	if (problems.length) {
		console.error(`Found ${problems.length} Pal location issue(s):`);
		for (const problem of problems) {
			console.error(`- ${problem}`);
		}
		process.exitCode = 1;
	} else {
		console.log(`Pal location audit passed.`);
	}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
