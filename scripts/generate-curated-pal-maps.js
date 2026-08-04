#!/usr/bin/env node

// Renders event-region and scripted-encounter maps that are absent from the ordinary habitat distribution table.
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const sharp = require(`sharp`);
const { loadMap, renderMap, writeOutput } = require(`./lib/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const OUTPUT = process.env.PALDECK_MAP_OUTPUT_DIR || path.join(ROOT, `data`, `maps`);
const PAL_DATA = path.join(ROOT, `data`, `palData.json`);
const SETTINGS = {
	palpagos: { key: `palpagos`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`, tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024] },
	worldtree: { key: `worldtree`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`, tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912] },
};

async function main() {
	const namesIndex = process.argv.indexOf(`--names`);
	const requestedNames = new Set((namesIndex >= 0 ? process.argv[namesIndex + 1] : ``).split(`,`).map(value => value.trim()).filter(Boolean));
	const maps = Object.fromEntries(await Promise.all(Object.entries(SETTINGS).map(async ([key, settings]) => [key, await loadMap(settings, CACHE)])));
	const data = JSON.parse(fs.readFileSync(PAL_DATA, `utf8`));
	const definitions = {
		Mau: { file: `027-mau.png`, map: `palpagos`, href: [`Ravine_Grotto`, `Mountain_Stream_Grotto`], label: `Dungeon`, style: `diamond`, color: `#ff9600` },
		"Katress Ignis": { file: `075b-katress-ignis.png`, map: `palpagos`, href: [`Cherry_Blossom_Cave`], label: `Dungeon`, style: `diamond`, color: `#ff9600` },
		Xenovader: {
			file: `145-xenovader.png`, map: `palpagos`,
			supplyPools: [`Grass_Supply`, `Forest_Supply`, `Desert_Supply`, `Volcano_Supply`, `Snow_Supply`, `DarkIsland_Supply`, `SkyIsland_Supply`],
			label: `Meteorite Event`, style: `diamond`, color: `#d946ef`,
		},
		Xenogard: {
			file: `146-xenogard.png`, map: `palpagos`,
			supplyPools: [`Desert_Supply`, `Volcano_Supply`, `Snow_Supply`, `DarkIsland_Supply`, `SkyIsland_Supply`],
			label: `Meteorite Event`, style: `diamond`, color: `#d946ef`,
		},
		Selyne: {
			file: `190-selyne.png`, map: `palpagos`, supplyPools: [`Sakurajima_Supply`], appendExistingPanel: true,
			label: `Meteorite Event`, style: `diamond`, color: `#d946ef`,
		},
		Silvance: { file: `193-silvance.png`, map: `worldtree`, href: `Immortal_Shade_Silvance`, label: `Alpha`, style: `cluster` },
		Dandilord: { file: `194-dandilord.png`, map: `worldtree`, href: `Bewitching_Lurker_Dandilord`, label: `Alpha`, style: `cluster` },
		Panthalus: { file: `203-panthalus.png`, map: `palpagos`, items: [`Deserted Islet`], label: `Alpha`, style: `cluster` },
		Astralym: { file: `204-astralym.png`, map: `worldtree`, href: `Nullstar_Calamity_Zenara_%26_Astralym`, label: `Alpha`, style: `cluster` },
	};
	const terrariaPals = data.Pals.filter(pal => pal.spawnTime === `Sealed Realm of Terraria`);
	for (const pal of terrariaPals) {
		definitions[pal.name] = {
			file: `terraria-sealed-realm.png`,
			map: `palpagos`, items: [`Sealed Realm of Terraria`], label: `Sealed Realm of Terraria`, style: `cluster`,
		};
	}
	const rendered = new Set();
	for (const pal of data.Pals) {
		if (requestedNames.size && !requestedNames.has(pal.name)) {
			continue;
		}
		const definition = definitions[pal.name];
		if (!definition) {
			continue;
		}
		const map = maps[definition.map];
		const hrefs = Array.isArray(definition.href) ? definition.href : definition.href ? [definition.href] : [];
		const items = definition.items || [];
		let markers = [];
		if (definition.supplyPools) {
			// Supply Incident pins are intentionally restricted to the three Pals whose encounters use this system.
			markers = map.markers.filter(value => value.type === `Supply` && definition.supplyPools.includes(value.href));
		} else if (hrefs.length) {
			markers = map.markers.filter(value => hrefs.includes(value.href));
		} else if (items.length) {
			markers = map.markers.filter(value => items.includes(value.item));
		} else if (definition.pos) {
			markers = [{ pos: definition.pos }];
		}
		const groups = [{
			label: definition.label, color: definition.color || `#ff0000`, style: definition.style || `normal`,
			markers, legendOnly: !markers.length,
		}];
		if (!rendered.has(definition.file)) {
			const target = path.join(OUTPUT, definition.file);
			if (definition.appendExistingPanel && fs.existsSync(target)) {
				const directory = fs.mkdtempSync(path.join(os.tmpdir(), `paldeck-curated-map-`));
				try {
					const panel = path.join(directory, definition.file);
					await renderMap(map, groups, panel, definition.map === `worldtree`);
					const existing = sharp(target);
					const metadata = await existing.metadata();
					// PalDB's World Tree panel is 800 px tall; retain only that panel on repeatable reruns.
					const tailHeight = Math.min(800, metadata.height);
					const tail = await existing.extract({ left: 0, top: metadata.height - tailHeight, width: metadata.width, height: tailHeight }).png().toBuffer();
					const head = await sharp(panel).png().toBuffer();
					const output = await sharp({ create: { width: 1024, height: 1024 + tailHeight, channels: 3, background: `#081218` } })
						.composite([{ input: head, left: 0, top: 0 }, { input: tail, left: 0, top: 1024 }]).png().toBuffer();
					writeOutput(target, output);
				} finally {
					fs.rmSync(directory, { recursive: true, force: true });
				}
			} else {
				await renderMap(map, groups, target, definition.map === `worldtree`);
			}
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
