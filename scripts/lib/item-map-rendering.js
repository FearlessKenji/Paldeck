// Shares cached map loading, coordinate conversion, SVG overlays, and PNG output for map generators.
/* eslint-disable max-statements-per-line -- compact fetch guards and SVG assembly are intentionally linear. */
const { Buffer } = require(`node:buffer`);
const fs = require(`node:fs`);
const path = require(`node:path`);
const sharp = require(`sharp`);

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
	return map.markers.filter(marker => filters.some(filter => !filter.locationSet &&
		Object.entries(filter).every(([key, value]) => [`style`, `label`].includes(key) || marker[key] === value),
	));
}

function fixedLocationMarkers(locationSet) {
	if (locationSet.coordinateTransform !== `worldTreeMap`) {
		throw new Error(`Unsupported fixed-location coordinate transform: ${locationSet.coordinateTransform}`);
	}
	// World Tree chest exports use displayed map coordinates: X/Y are swapped and scaled from world units.
	return locationSet.markers.map(([mapX, mapY, mapZ]) => ({ pos: { X: mapY * 400, Y: mapX * 400, Z: mapZ * 100 } }));
}

function markerSvg(x, y, color, style) {
	if (style === `diamond`) {
		return `<polygon points="${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}" fill="${color}" stroke="white"/>`;
	}
	const radius = style === `cluster` ? 10 : style === `compact` ? 3 : style === `density` ? 2 : 6;
	return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" fill-opacity=".85" stroke="${style === `cluster` ? `white` : color}" stroke-width="${style === `cluster` ? 3 : 2}"/>`;
}

async function renderMap(map, groups, target, bottomRight = false) {
	const crop = map.crop || [0, 0, 1024, 1024];
	const width = crop[2] - crop[0];
	const height = crop[3] - crop[1];
	const visible = groups.filter(group => group.markers.length);
	const pins = visible.flatMap(group => group.markers.map(marker => {
		const [x, y] = toPixel(marker.pos, map.config, crop);
		return markerSvg(x, y, group.color, group.style);
	})).join(``);
	let legend = ``;
	if (visible.length > 1) {
		const boxWidth = Math.max(170, ...visible.map(group => 42 + group.label.length * 7));
		const boxHeight = 12 + visible.length * 22;
		const left = bottomRight ? width - boxWidth - 10 : 10;
		const top = bottomRight ? height - boxHeight - 10 : 10;
		const rows = visible.map((group, index) => {
			const y = top + 16 + index * 22;
			return `${markerSvg(left + 16, y, group.color, group.style)}<text x="${left + 34}" y="${y + 5}" fill="white" font-family="Arial" font-size="12">${group.label}</text>`;
		}).join(``);
		legend = `<rect x="${left}" y="${top}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="#0f172a" fill-opacity=".86" stroke="white"/>${rows}`;
	}
	const svg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${pins}${legend}</svg>`);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	await sharp(map.base).extract({ left: crop[0], top: crop[1], width, height })
		.composite([{ input: svg }]).png({ compressionLevel: 9, palette: true, colours: 192 }).toFile(target);
}

module.exports = { fetchCached, fixedLocationMarkers, loadMap, parseJsonVariable, renderMap, selectMarkers, toPixel };
