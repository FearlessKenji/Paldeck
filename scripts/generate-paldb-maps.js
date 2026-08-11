// Regenerates Pal habitat PNGs from PalDB distributions with the shared JavaScript renderer.

const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const sharp = require(`sharp`);
const { fetchCached, loadMap, renderMap, writeOutput } = require(`./lib/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`);
const PAL_DATA = path.join(ROOT, `data`, `palData.json`);
const OUTPUT = process.env.PALDECK_MAP_OUTPUT_DIR || path.join(ROOT, `data`, `maps`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const UNKNOWN = `data/maps/unknown-habitat.png`;
// Long map batches otherwise exhaust Windows/libvips output handles partway through the run.
sharp.cache(false);
sharp.concurrency(1);
const SETTINGS = {
	palpagos: { key: `palpagos`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`, tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024] },
	worldtree: { key: `worldtree`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`, tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912] },
};

function argument(name) {
	const index = process.argv.indexOf(name);
	return index < 0 ? null : process.argv[index + 1];
}

function slug(value) {
	return value.toLowerCase().replaceAll(`&`, `and`).replace(/[^a-z0-9]+/gu, `-`).replace(/^-|-$/gu, ``);
}

async function palCode(name) {
	const url = `https://paldb.cc/en/` + encodeURIComponent(name.replaceAll(` `, `_`));
	const match = (await fetchCached(url, CACHE)).toString(`utf8`).match(/href="[^"]*\?pal=([^"&]+)&t=[^"]+"/u);
	return match ? decodeURIComponent(match[1]) : null;
}

function locationGroups(row, code, map) {
	const inBounds = value => value.X >= map.config.landScapeRealPositionMin.X && value.X <= map.config.landScapeRealPositionMax.X &&
		value.Y >= map.config.landScapeRealPositionMin.Y && value.Y <= map.config.landScapeRealPositionMax.Y;
	const day = new Map((row?.dayTimeLocations?.Locations || []).filter(inBounds).map(value => [JSON.stringify(value), value]));
	const night = new Map((row?.nightTimeLocations?.Locations || []).filter(inBounds).map(value => [JSON.stringify(value), value]));
	const groups = { both: [], day: [], night: [] };
	for (const key of new Set([...day.keys(), ...night.keys()])) {
		const bucket = day.has(key) && night.has(key) ? `both` : day.has(key) ? `day` : `night`;
		groups[bucket].push({ pos: day.get(key) || night.get(key) });
	}
	const ids = new Set([code.toLowerCase(), `boss_` + code.toLowerCase()]);
	// Only fixed Alpha encounters belong on habitat maps; incident and captured-cage records are availability sources, not habitats.
	const fixed = map.markers.filter(marker => marker.pos && marker.type === `Alpha Pal` && ids.has(String(marker.id || ``).toLowerCase()));
	return [
		{ label: `Day/Night`, color: `#ff0000`, style: `normal`, markers: groups.both },
		{ label: `Day`, color: `#ff7800`, style: `normal`, markers: groups.day },
		{ label: `Night`, color: `#593cf2`, style: `normal`, markers: groups.night },
		{ label: `Alpha`, color: `#ff0000`, style: `cluster`, markers: fixed },
	].filter(group => group.markers.length);
}

async function stack(files, target) {
	const metadata = await Promise.all(files.map(file => sharp(file).metadata()));
	const width = Math.max(...metadata.map(value => value.width));
	const height = metadata.reduce((sum, value) => sum + value.height, 0);
	let top = 0;
	const panels = files.map((file, index) => {
		const panel = { input: file, left: 0, top };
		top += metadata[index].height;
		return panel;
	});
	const output = await sharp({ create: { width, height, channels: 3, background: `#081218` } }).composite(panels).png().toBuffer();
	writeOutput(target, output);
}

function commandOptions() {
	const positional = process.argv.slice(2).filter(value => !value.startsWith(`--`));
	return {
		limit: Number(argument(`--limit`) || positional.find(value => /^\d+$/u.test(value)) || 0),
		requestedNames: new Set(String(argument(`--names`) || ``).split(`,`).map(value => value.trim().toLowerCase()).filter(Boolean)),
		clean: process.argv.includes(`--clean`) || positional.includes(`clean`),
		skipJson: process.argv.includes(`--skip-json`) || positional.includes(`skip-json`),
		multipleGroupsOnly: process.argv.includes(`--multiple-groups`),
	};
}

function existingHabitat(pal) {
	const prefix = pal.number.toLowerCase() === `-1` ? `terraria` : pal.number.toLowerCase();
	const existing = `data/maps/${prefix}-${slug(pal.name)}.png`;
	// Fixed/scripted encounters may be absent from the distribution table; retain a verified existing map instead of erasing it.
	const current = pal.habitat && fs.existsSync(path.join(ROOT, pal.habitat)) ? pal.habitat : null;
	return current || (fs.existsSync(path.join(ROOT, existing)) ? existing : UNKNOWN);
}

async function renderPal({ pal, distribution, lower, maps, desired, multipleGroupsOnly }) {
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `paldeck-pal-map-`));
	try {
		const code = pal.breeding?.id || await palCode(pal.name);
		const row = code ? distribution[code] || lower.get(code.toLowerCase()) : null;
		const panels = [];
		if (row) {
			const mapGroups = Object.entries(maps).map(([key, map]) => ({ key, map, groups: locationGroups(row, code, map) }));
			if (multipleGroupsOnly && mapGroups.reduce((sum, value) => sum + value.groups.length, 0) < 2) {
				return { status: `skipped`, habitat: pal.habitat };
			}
			for (const { key, map, groups } of mapGroups.filter(value => value.groups.length)) {
				const panel = path.join(temporary, key + `.png`);
				await renderMap(map, groups, panel, key === `worldtree`);
				panels.push(panel);
			}
		}
		if (!panels.length) {
			const habitat = existingHabitat(pal);
			if (habitat !== UNKNOWN) {
				desired.add(path.basename(habitat));
			}
			return { status: `unknown`, habitat };
		}
		const prefix = pal.number.toLowerCase() === `-1` ? `terraria` : pal.number.toLowerCase();
		const filename = `${prefix}-${slug(pal.name)}.png`;
		await stack(panels, path.join(OUTPUT, filename));
		desired.add(filename);
		return { status: `generated`, habitat: `data/maps/${filename}` };
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}

function cleanOutputs(desired) {
	for (const file of fs.readdirSync(OUTPUT).filter(value => value.endsWith(`.png`))) {
		if (!desired.has(file)) {
			fs.rmSync(path.join(OUTPUT, file));
		}
	}
}

async function main() {
	const { limit, requestedNames, clean, skipJson, multipleGroupsOnly } = commandOptions();
	const data = JSON.parse(fs.readFileSync(PAL_DATA, `utf8`));
	const selectedPals = requestedNames.size ? data.Pals.filter(pal => requestedNames.has(pal.name.toLowerCase())) : data.Pals;
	const pals = limit ? selectedPals.slice(0, limit) : selectedPals;
	const loadedMaps = await Promise.all(
		Object.entries(SETTINGS).map(async ([key, value]) => [key, await loadMap(value, CACHE)]),
	);
	const maps = Object.fromEntries(loadedMaps);
	const response = await fetchCached(`https://paldb.cc/DataTable/UI/DT_PaldexDistributionData.json?_=1730258749`, CACHE);
	const distribution = JSON.parse(response.toString(`utf8`))[0].Rows;
	const lower = new Map(Object.entries(distribution).map(([key, value]) => [key.toLowerCase(), value]));
	const summary = { generated: 0, unknown: 0, failures: 0 };
	const desired = new Set([path.basename(UNKNOWN)]);
	fs.mkdirSync(OUTPUT, { recursive: true });
	for (const pal of pals) {
		try {
			const result = await renderPal({ pal, distribution, lower, maps, desired, multipleGroupsOnly });
			pal.habitat = result.habitat;
			if (result.status === `unknown`) {
				summary.unknown += 1;
			}
			if (result.status === `generated`) {
				summary.generated += 1;
			}
		} catch (error) {
			console.warn(`Failed to render ${pal.name}: ${error.message || error}`);
			summary.failures += 1;
		}
	}
	if (!skipJson && !limit) {
		fs.writeFileSync(PAL_DATA, JSON.stringify(data, null, `\t`) + `\n`);
	}
	if (clean && !limit) {
		cleanOutputs(desired);
	}
	console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
