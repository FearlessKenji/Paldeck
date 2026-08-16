// Shares cached map loading, coordinate conversion, SVG overlays, and PNG output for map generators.
/* eslint-disable max-statements-per-line -- compact fetch guards and SVG assembly are intentionally linear. */
const { Buffer } = require(`node:buffer`);
const fs = require(`node:fs`);
const path = require(`node:path`);
const sharp = require(`sharp`);
const markerPresentation = require(`../../data/mapGenerationRules.json`);

const CHEST_GRADE_PRESENTATION = markerPresentation.chestGrades;
const ITEM_SOURCE_PRESENTATION = markerPresentation.sources;
const MARKER_STYLES = markerPresentation.styles;

function validateMarkerPresentation() {
	if (markerPresentation.schemaVersion !== 1 || !markerPresentation.naming?.directory) {
		throw new Error(`Map generation rules require schemaVersion 1 and a naming policy.`);
	}
	const signatures = new Map();
	for (const [name, definition] of Object.entries(MARKER_STYLES)) {
		const signature = JSON.stringify(definition);
		if (signatures.has(signature)) {
			throw new Error(`Map marker styles ${signatures.get(signature)} and ${name} have duplicate rendering rules.`);
		}
		signatures.set(signature, name);
	}
	for (const [type, presentation] of Object.entries(ITEM_SOURCE_PRESENTATION)) {
		if (!MARKER_STYLES[presentation.style]) {
			throw new Error(`${type} references unknown map marker style ${presentation.style}.`);
		}
	}
	for (const [type, qualifier] of Object.entries(markerPresentation.naming.sourceQualifiers || {})) {
		if (!ITEM_SOURCE_PRESENTATION[type] || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(qualifier)) {
			throw new Error(`${type} has an invalid map filename qualifier.`);
		}
	}
}

validateMarkerPresentation();

function cachePath(directory, url) {
	return path.join(directory, url.replace(/^https?:\/\//u, ``).replace(/[^a-zA-Z0-9_.-]+/gu, `_`));
}

async function fetchCached(url, directory) {
	const target = cachePath(directory, url);
	if (fs.existsSync(target)) {return fs.readFileSync(target);}
	const response = await fetch(url, { headers: { 'User-Agent': `Mozilla/5.0` } });
	if (!response.ok) {throw new Error(`Failed to fetch ${url}: ${response.status}`);}
	const payload = Buffer.from(await response.arrayBuffer());
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, payload);
	return payload;
}

function parseJsonVariable(script, name) {
	const match = script.match(new RegExp(`var\\s+${name}\\s*=\\s*(.*?);var\\s+`, `su`));
	if (!match) {throw new Error(`Could not find ${name} in map data.`);}
	return JSON.parse(match[1]);
}

function toPixel(position, config, crop = [0, 0, 1024, 1024]) {
	const min = config.landScapeRealPositionMin;
	const max = config.landScapeRealPositionMax;
	return [
		((position.Y - min.Y) / (max.Y - min.Y)) * 1024 - crop[0],
		(1 - ((position.X - min.X) / (max.X - min.X))) * 1024 - crop[1],
	];
}

async function loadMap(settings, cacheDirectory) {
	const script = (await fetchCached(settings.script, cacheDirectory)).toString(`utf8`);
	const overlays = [];
	for (let x = 0; x < 2; x += 1) {
		for (let y = 0; y < 2; y += 1) {
			const url = `https://cdn.paldb.cc/${settings.tileDirectory}/z1x${x}y${y}.webp`;
			const tile = await sharp(await fetchCached(url, cacheDirectory)).resize(512, 512).png().toBuffer();
			overlays.push({ input: tile, left: x * 512, top: y * 512 });
		}
	}
	const base = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: `#dddddd` } })
		.composite(overlays).png().toBuffer();
	return {
		...settings,
		base,
		config: parseJsonVariable(script, `config`),
		markers: parseJsonVariable(script, `fixedDungeon`),
	};
}

function selectMarkers(map, filters) {
	return map.markers.filter(marker => filters.some(filter => {
		const matchesFields = Object.entries(filter).every(([key, value]) =>
			// Array-valued filters compactly select several game-backed pools that share one legend group.
			[`style`, `color`, `label`, `legendType`, `bounds`, `grade`, `treasureGrade`, `lotteryFields`].includes(key) ||
			(Array.isArray(value) ? value.includes(marker[key]) : marker[key] === value),
		);
		const bounds = filter.bounds;
		// Oil-rig reward markers share a type, so coordinate bounds distinguish each physical rig.
		const matchesBounds = !bounds || (marker.pos?.X >= bounds.minX && marker.pos.X <= bounds.maxX &&
			marker.pos?.Y >= bounds.minY && marker.pos.Y <= bounds.maxY);
		return matchesFields && matchesBounds;
	}));
}

function fixedLocationMarkers(locationSet) {
	if (locationSet.coordinateTransform !== `worldTreeMap`) {
		throw new Error(`Unsupported fixed-location coordinate transform: ${locationSet.coordinateTransform}`);
	}
	// Game map coordinates use swapped axes, a 459-unit scale, and the Palpagos world-origin offset.
	return locationSet.markers.map(([mapX, mapY, mapZ]) => ({
		pos: { X: mapY * 459 - 123888, Y: mapX * 459 + 158000, Z: mapZ * 100 },
	}));
}

function markerSvg(x, y, color, style) {
	const definition = MARKER_STYLES[style];
	if (!definition) {
		throw new Error(`Unknown map marker style: ${style}`);
	}
	const radius = definition.radius;
	const stroke = definition.outlineColor === `source` ? color : definition.outlineColor;
	if (definition.shape === `diamond`) {
		return `<polygon points="${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}" fill="${color}" stroke="${stroke}" stroke-width="${definition.outlineWidth}"/>`;
	}
	if (definition.shape !== `circle`) {
		throw new Error(`Unsupported map marker shape: ${definition.shape}`);
	}
	return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" fill-opacity=".9" stroke="${stroke}" stroke-width="${definition.outlineWidth}"/>`;
}

function escapeXml(value) {
	return String(value).replaceAll(`&`, `&amp;`).replaceAll(`<`, `&lt;`).replaceAll(`>`, `&gt;`);
}

function writeOutput(target, output) {
	for (let attempt = 0; attempt < 12; attempt += 1) {
		try {
			fs.writeFileSync(target, output);
			return;
		} catch (error) {
			if (attempt === 11) {throw error;}
			// Windows readers can briefly lock an existing PNG while cards or local previews are serving it.
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
		}
	}
}

function legendLabel(type, label) {
	return ITEM_SOURCE_PRESENTATION[type]?.label || label || type;
}

function itemSourcePresentation(filter) {
	const type = filter.legendType || filter.type || `Location`;
	const chestGrade = Number(filter.treasureGrade || filter.grade || 0);
	if (type === `Treasure` && CHEST_GRADE_PRESENTATION[chestGrade]) {
		return { ...CHEST_GRADE_PRESENTATION[chestGrade], style: `normal` };
	}
	const canonical = ITEM_SOURCE_PRESENTATION[type];
	const defaults = canonical || { color: `#ef4444`, style: /cluster/iu.test(type) ? `special` : `normal` };
	return {
		label: legendLabel(type, filter.label),
		// Known source types always use the shared legend system; custom presentation remains available for resources and effigies.
		color: canonical ? defaults.color : filter.color || defaults.color,
		style: canonical ? defaults.style : filter.style || defaults.style,
	};
}

async function renderMap(map, groups, target, bottomRight = false) {
	const crop = map.crop || [0, 0, 1024, 1024];
	const width = crop[2] - crop[0];
	const height = crop[3] - crop[1];
	const visible = groups.filter(group => group.markers.length || group.legendOnly);
	const pins = visible.flatMap(group => group.markers.map(marker => {
		const [x, y] = toPixel(marker.pos, map.config, crop);
		return markerSvg(x, y, group.color, group.style);
	})).join(``);
	let legend = ``;
	if (visible.length) {
		const boxWidth = Math.max(170, ...visible.map(group => 42 + group.label.length * 7));
		const boxHeight = 12 + visible.length * 22;
		const left = bottomRight ? width - boxWidth - 10 : 10;
		const top = bottomRight ? height - boxHeight - 10 : 10;
		const rows = visible.map((group, index) => {
			const y = top + 16 + index * 22;
			return `${markerSvg(left + 16, y, group.color, group.style)}<text x="${left + 34}" y="${y + 5}" fill="white" font-family="Arial" font-size="12">${escapeXml(group.label)}</text>`;
		}).join(``);
		legend = `<rect x="${left}" y="${top}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="#0f172a" fill-opacity=".86" stroke="white"/>${rows}`;
	}
	const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${pins}${legend}</svg>`);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	// Buffer-first output avoids intermittent libvips direct-file failures on Windows during large map batches.
	const output = await sharp(map.base).extract({ left: crop[0], top: crop[1], width, height })
		.composite([{ input: svg }]).png({ compressionLevel: 9, palette: true, colours: 192 }).toBuffer();
	writeOutput(target, output);
}

module.exports = {
	CHEST_GRADE_PRESENTATION, fetchCached, fixedLocationMarkers, itemSourcePresentation,
	legendLabel, loadMap, MARKER_STYLES, parseJsonVariable, renderMap, selectMarkers, toPixel, writeOutput,
};
