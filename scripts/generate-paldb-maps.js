// Regenerates Pal habitat PNGs from PalDB distributions with the shared JavaScript renderer.

const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const sharp = require(`sharp`);
const { fetchCached, loadMap, renderMap } = require(`./lib/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`);
const PAL_DATA = path.join(ROOT, `data`, `palData.json`);
const OUTPUT = process.env.PALDECK_MAP_OUTPUT_DIR || path.join(ROOT, `data`, `maps`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const UNKNOWN = `data/maps/unknown-habitat.png`;
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

function locationGroups(row, code, map) {
	const day = new Map((row?.dayTimeLocations?.Locations || []).map(value => [JSON.stringify(value), value]));
	const night = new Map((row?.nightTimeLocations?.Locations || []).map(value => [JSON.stringify(value), value]));
	const groups = { both: [], day: [], night: [] };
	for (const key of new Set([...day.keys(), ...night.keys()])) {
		const bucket = day.has(key) && night.has(key) ? `both` : day.has(key) ? `day` : `night`;
		groups[bucket].push({ pos: day.get(key) || night.get(key) });
	}
	const ids = new Set([code.toLowerCase(), `boss_` + code.toLowerCase()]);
	// Only fixed Alpha encounters belong on Pal habitat maps. Incident and cage sources are intentionally excluded.
	const fixed = map.markers.filter(marker =>
		marker.pos && marker.type === `Alpha Pal` && ids.has(String(marker.id || ``).toLowerCase()),
	);
	return [
		{ label: `Day and night`, color: `#ff0000`, style: `normal`, markers: groups.both },
		{ label: `Day`, color: `#ff7800`, style: `normal`, markers: groups.day },
		{ label: `Night`, color: `#593cf2`, style: `normal`, markers: groups.night },
		{ label: `Fixed Alpha`, color: `#ff0000`, style: `cluster`, markers: fixed },
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
	await sharp({ create: { width, height, channels: 3, background: `#081218` } }).composite(panels).png().toFile(target);
}

async function main() {
	const positional = process.argv.slice(2).filter(value => !value.startsWith(`--`));
	const limit = Number(argument(`--limit`) || positional.find(value => /^\d+$/u.test(value)) || 0);
	const clean = process.argv.includes(`--clean`) || positional.includes(`clean`);
	const skipJson = process.argv.includes(`--skip-json`) || positional.includes(`skip-json`);
	const data = JSON.parse(fs.readFileSync(PAL_DATA, `utf8`));
	const pals = limit ? data.Pals.slice(0, limit) : data.Pals;
	const maps = Object.fromEntries(await Promise.all(Object.entries(SETTINGS).map(async ([key, value]) => [key, await loadMap(value, CACHE)])));
	const response = await fetchCached(`https://paldb.cc/DataTable/UI/DT_PaldexDistributionData.json?_=1730258749`, CACHE);
	const distribution = JSON.parse(response.toString(`utf8`))[0].Rows;
	const lower = new Map(Object.entries(distribution).map(([key, value]) => [key.toLowerCase(), value]));
	const summary = { generated: 0, unknown: 0, failures: 0 };
	const desired = new Set([path.basename(UNKNOWN)]);
	fs.mkdirSync(OUTPUT, { recursive: true });
	for (const pal of pals) {
		const temporary = fs.mkdtempSync(path.join(os.tmpdir(), `paldeck-pal-map-`));
		try {
			// breeding.id is the canonical internal Pal row name and is more stable than scraping it from a PalDB page.
			const code = pal.breeding?.id || null;
			const row = code ? distribution[code] || lower.get(code.toLowerCase()) : null;
			const panels = [];
			if (row) {
				for (const [key, map] of Object.entries(maps)) {
					const groups = locationGroups(row, code, map);
					if (groups.length) {
						const panel = path.join(temporary, key + `.png`);
						await renderMap(map, groups, panel, key === `worldtree`);
						panels.push(panel);
					}
				}
			}
			if (!panels.length) {
				pal.habitat = UNKNOWN;
				summary.unknown += 1;
				continue;
			}
			const prefix = pal.number.toLowerCase() === `-1` ? `terraria` : pal.number.toLowerCase();
			const filename = prefix + `-` + slug(pal.name) + `.png`;
			await stack(panels, path.join(OUTPUT, filename));
			pal.habitat = `data/maps/` + filename;
			desired.add(filename);
			summary.generated += 1;
		} catch (_error) {
			pal.habitat = UNKNOWN;
			summary.failures += 1;
		} finally {
			fs.rmSync(temporary, { recursive: true, force: true });
		}
	}
	if (!skipJson && !limit) {
		fs.writeFileSync(PAL_DATA, JSON.stringify(data, null, `\t`) + `\n`);
	}
	if (clean && !limit) {
		for (const file of fs.readdirSync(OUTPUT).filter(value => value.endsWith(`.png`))) {
			if (!desired.has(file)) {
				fs.rmSync(path.join(OUTPUT, file));
			}
		}
	}
	console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
