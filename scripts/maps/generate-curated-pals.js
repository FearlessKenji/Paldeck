#!/usr/bin/env node

// Renders event-region and scripted-encounter maps that are absent from the ordinary habitat distribution table.
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const sharp = require(`sharp`);
const { curatedPalHabitats } = require(`../../utils/curatedPalHabitats.js`);
const { loadMap, renderMap, writeOutput } = require(`../lib/maps/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const OUTPUT = process.env.PALDECK_MAP_OUTPUT_DIR || path.join(ROOT, `data`, `maps`);
const PAL_DATA = path.join(ROOT, `data`, `palData.json`);
const SETTINGS = {
	palpagos: { key: `palpagos`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`, tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024] },
	worldtree: { key: `worldtree`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`, tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912] },
};

function markerGroups(definition, map) {
	const hrefs = Array.isArray(definition.href) ? definition.href : definition.href ? [definition.href] : [];
	let markers = [];
	if (definition.supplyPools) {
		// Supply Incident pins are intentionally restricted to the three Pals whose encounters use this system.
		markers = map.markers.filter(value => value.type === `Supply` && definition.supplyPools.includes(value.href));
	} else if (hrefs.length) {
		markers = map.markers.filter(value => hrefs.includes(value.href));
	} else if (definition.items?.length) {
		markers = map.markers.filter(value => definition.items.includes(value.item));
	} else if (definition.pos) {
		markers = [{ pos: definition.pos }];
	}
	return [{
		label: definition.label, color: definition.color || `#ff0000`, style: definition.style || `normal`,
		markers, legendOnly: !markers.length,
	}, ...(definition.extraGroups || []).map(extra => ({
		label: extra.label, color: extra.color || `#ff0000`, style: extra.style || `normal`,
		markers: map.markers.filter(value => value.href === extra.href),
	}))];
}

async function appendExistingPanel(map, groups, target, definition) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), `paldeck-curated-map-`));
	try {
		const panel = path.join(directory, definition.file);
		await renderMap(map, groups, panel, definition.map === `worldtree`);
		const existing = sharp(target);
		const metadata = await existing.metadata();
		// PalDB's World Tree panel is 800 px tall; retain only that panel on repeatable reruns.
		const tailHeight = Math.min(800, metadata.height);
		const tail = await existing.extract({
			left: 0, top: metadata.height - tailHeight, width: metadata.width, height: tailHeight,
		}).png().toBuffer();
		const head = await sharp(panel).png().toBuffer();
		const output = await sharp({
			create: { width: 1024, height: 1024 + tailHeight, channels: 3, background: `#081218` },
		}).composite([{ input: head, left: 0, top: 0 }, { input: tail, left: 0, top: 1024 }]).png().toBuffer();
		writeOutput(target, output);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
}

async function renderDefinition(definition, maps) {
	const map = maps[definition.map];
	const groups = markerGroups(definition, map);
	const target = path.join(OUTPUT, definition.file);
	if (definition.appendExistingPanel && fs.existsSync(target)) {
		await appendExistingPanel(map, groups, target, definition);
	} else {
		await renderMap(map, groups, target, definition.map === `worldtree`);
	}
}

async function main() {
	const namesIndex = process.argv.indexOf(`--names`);
	const requestedNames = new Set((namesIndex >= 0 ? process.argv[namesIndex + 1] : ``).split(`,`).map(value => value.trim()).filter(Boolean));
	const loadedMaps = await Promise.all(
		Object.entries(SETTINGS).map(async ([key, settings]) => [key, await loadMap(settings, CACHE)]),
	);
	const maps = Object.fromEntries(loadedMaps);
	const data = JSON.parse(fs.readFileSync(PAL_DATA, `utf8`));
	const definitions = curatedPalHabitats(data.Pals);
	const rendered = new Set();
	for (const pal of data.Pals) {
		if (requestedNames.size && !requestedNames.has(pal.name)) {
			continue;
		}
		const definition = definitions[pal.name];
		if (!definition) {
			continue;
		}
		if (!rendered.has(definition.file)) {
			await renderDefinition(definition, maps);
			rendered.add(definition.file);
		}
		pal.habitat = `data/maps/${definition.file}`;
	}
	fs.writeFileSync(PAL_DATA, `${JSON.stringify(data, null, `\t`)}\n`);
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
