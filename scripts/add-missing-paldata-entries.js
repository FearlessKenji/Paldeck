const fs = require(`node:fs`);
const path = require(`node:path`);
const { Buffer } = require(`node:buffer`);
const { URL } = require(`node:url`);
const {
	ELEMENT_NAMES,
	fetchPaldbData,
	mapByName,
	normalizeKey,
	splitList,
} = require(`./lib/paldb-data.js`);

const ROOT_DIR = path.resolve(__dirname, `..`);
const PAL_DATA_PATH = path.join(ROOT_DIR, `data`, `palData.json`);
const PALS_IMAGE_DIR = path.join(ROOT_DIR, `data`, `pals`);
const FANDOM_API_URL = `https://palworld.fandom.com/api.php`;
const UNKNOWN_THUMBNAIL = `data/pals/pal-unknown.png`;
const UNKNOWN_TEXT = `Unknown. Too new.`;

function parseArgs(argv) {
	const options = {
		limit: 25,
		write: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === `--write`) {
			options.write = true;
			continue;
		}

		if (arg === `--limit`) {
			const value = Number.parseInt(argv[index + 1], 10);

			if (Number.isInteger(value) && value >= 0) {
				options.limit = value;
			}

			index += 1;
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return options;
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, `utf8`));
}

function stringifyJson(data) {
	return JSON.stringify(data, null, `\t`)
		.replace(/\[\n(\t+)(\d+),\n\1(\d+),\n\1(\d+)\n\t*\]/g, `[$2, $3, $4]`);
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, `${stringifyJson(data)}\n`);
}

function chunk(items, size) {
	const chunks = [];

	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}

	return chunks;
}

async function fetchFandomThumbnails(names) {
	const thumbnailsByName = new Map();

	for (const namesChunk of chunk(names, 45)) {
		const url = new URL(FANDOM_API_URL);

		url.searchParams.set(`action`, `query`);
		url.searchParams.set(`titles`, namesChunk.join(`|`));
		url.searchParams.set(`prop`, `pageimages`);
		url.searchParams.set(`piprop`, `thumbnail`);
		url.searchParams.set(`pithumbsize`, `256`);
		url.searchParams.set(`format`, `json`);

		const response = await fetch(url);

		if (!response.ok) {
			throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();

		for (const page of Object.values(data.query?.pages || {})) {
			const source = page.thumbnail?.source || ``;

			if (page.title && source) {
				thumbnailsByName.set(normalizeKey(page.title), source);
			}
		}
	}

	return thumbnailsByName;
}

function slugify(value) {
	return String(value || ``)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, `-`)
		.replace(/^-|-$/g, ``);
}

function thumbnailPathFor(row) {
	return `data/pals/pal-${String(row.number || `-1`).toLowerCase()}-${slugify(row.name)}.png`;
}

async function downloadThumbnail(sourceUrl, relativePath) {
	const targetPath = path.join(ROOT_DIR, relativePath);

	if (fs.existsSync(targetPath)) {
		return;
	}

	const response = await fetch(sourceUrl);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${sourceUrl}: ${response.status} ${response.statusText}`);
	}

	fs.mkdirSync(PALS_IMAGE_DIR, { recursive: true });
	fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
}

async function localizeThumbnails(rows, thumbnailsByName) {
	const localThumbnailsByName = new Map();

	for (const row of rows) {
		const sourceUrl = thumbnailsByName.get(normalizeKey(row.name));

		if (!sourceUrl) {
			continue;
		}

		const relativePath = thumbnailPathFor(row);

		await downloadThumbnail(sourceUrl, relativePath);
		localThumbnailsByName.set(normalizeKey(row.name), relativePath);
	}

	return localThumbnailsByName;
}

function ensureUnknownPalette(colors) {
	if (!colors[UNKNOWN_TEXT]) {
		colors[UNKNOWN_TEXT] = [255, 255, 255];
		return true;
	}

	return false;
}

function isRgbArray(color) {
	return Array.isArray(color) &&
		color.length === 3 &&
		color.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255);
}

function elementRank(element) {
	const index = ELEMENT_NAMES.indexOf(element);

	return index === -1 ? ELEMENT_NAMES.length : index;
}

function elementSignature(element) {
	return splitList(element)
		.sort((first, second) => {
			const firstRank = elementRank(first);
			const secondRank = elementRank(second);

			if (firstRank !== secondRank) {
				return firstRank - secondRank;
			}

			return first.localeCompare(second);
		})
		.map(entry => entry.toLowerCase())
		.join(`|`);
}

function formatElementKey(element) {
	return splitList(element).join(`, `);
}

function averageElementColor(element, colors) {
	const parts = splitList(element);
	const partColors = parts
		.map(part => colors[part])
		.filter(isRgbArray);

	if (partColors.length !== parts.length || !partColors.length) {
		return [255, 255, 255];
	}

	return [0, 1, 2].map(channelIndex => Math.round(
		partColors.reduce((sum, color) => sum + color[channelIndex], 0) / partColors.length,
	));
}

function ensurePaletteColor(element, colors, paletteAdditions) {
	if (isRgbArray(colors[element])) {
		return;
	}

	const color = averageElementColor(element, colors);
	colors[element] = color;
	paletteAdditions.push({
		color,
		element,
	});
}

function findPaletteKeyForElement(element, colors) {
	const signature = elementSignature(element);

	if (!signature) {
		return UNKNOWN_TEXT;
	}

	const sourceKey = formatElementKey(element);

	if (isRgbArray(colors[sourceKey])) {
		return sourceKey;
	}

	return Object.keys(colors)
		.find(key => elementSignature(key) === signature && isRgbArray(colors[key])) || sourceKey;
}

function createPalEntry(row, thumbnail, colors, paletteAdditions) {
	const element = row.element ? findPaletteKeyForElement(row.element, colors) : UNKNOWN_TEXT;

	ensurePaletteColor(element, colors, paletteAdditions);

	return {
		name: row.name,
		description: UNKNOWN_TEXT,
		number: row.number || `-1`,
		element,
		drops: UNKNOWN_TEXT,
		food: `Unknown/10`,
		partner: UNKNOWN_TEXT,
		suitability: row.suitability || UNKNOWN_TEXT,
		spawnTime: UNKNOWN_TEXT,
		farmable: UNKNOWN_TEXT,
		thumbnail,
		habitat: `data/maps/unknown-habitat.png`,
		rarity: 0,
	};
}

function printRows(title, rows, limit, formatter) {
	console.log(`\n${title}: ${rows.length}`);

	for (const row of rows.slice(0, limit)) {
		console.log(`- ${formatter(row)}`);
	}

	if (rows.length > limit) {
		console.log(`... ${rows.length - limit} more`);
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const palFile = readJson(PAL_DATA_PATH);
	const { currentRows } = await fetchPaldbData();
	const localByName = mapByName(palFile.Pals);
	const missingRows = currentRows.filter(row => !localByName.has(normalizeKey(row.name)));
	const thumbnailsByName = await fetchFandomThumbnails(missingRows.map(row => row.name));
	const localThumbnailsByName = await localizeThumbnails(missingRows, thumbnailsByName);
	const colors = palFile.Colors?.[0] || {};
	const paletteAdditions = [];
	const added = missingRows.map(row => createPalEntry(
		row,
		localThumbnailsByName.get(normalizeKey(row.name)) || UNKNOWN_THUMBNAIL,
		colors,
		paletteAdditions,
	));
	const paletteAdded = ensureUnknownPalette(colors);

	if (options.write) {
		palFile.Pals.push(...added);
		writeJson(PAL_DATA_PATH, palFile);
	}

	console.log(`Missing Paldeck profile update (${options.write ? `write` : `dry-run`})`);
	console.log(`PalDB current rows: ${currentRows.length}`);
	console.log(`Local palData rows: ${palFile.Pals.length}`);
	console.log(`Rows to add: ${added.length}`);
	console.log(`Fandom thumbnails localized: ${[...localThumbnailsByName.keys()].length}`);
	console.log(`Unknown thumbnail fallback: ${UNKNOWN_THUMBNAIL}`);
	console.log(`Unknown palette ${paletteAdded ? `will be added` : `already present`}.`);
	console.log(`Palette additions: ${paletteAdditions.length}`);
	console.log(`Files ${options.write ? `updated` : `not written`}.`);

	printRows(
		`Added rows`,
		added,
		options.limit,
		row => `#${row.number} ${row.name} (${row.element}) thumbnail=${row.thumbnail}`,
	);
	printRows(
		`Palette additions`,
		paletteAdditions,
		options.limit,
		row => `${row.element}: [${row.color.join(`, `)}]`,
	);

	if (!options.write) {
		console.log(`\nRun with --write to add these Paldeck profile rows.`);
	}
}

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});
