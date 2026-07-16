const { Buffer } = require(`node:buffer`);
const fs = require(`node:fs`);
const path = require(`node:path`);
const crypto = require(`node:crypto`);
const { URL } = require(`node:url`);
const { fetchPaldbItemData, slugify } = require(`./lib/paldb-items.js`);

const ROOT_DIR = path.resolve(__dirname, `..`);
const ITEM_DATA_PATH = path.join(ROOT_DIR, `data`, `itemData.json`);
const ITEM_ICON_DIR = path.join(ROOT_DIR, `data`, `items`);
const ITEM_ICON_RELATIVE_DIR = `data/items`;
const ITEM_ICON_EXTENSION = `.png`;
const ICON_DOWNLOAD_CONCURRENCY = 16;

function parseArgs(argv) {
	const options = {
		json: false,
		limit: 25,
		write: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === `--write`) {
			options.write = true;
			continue;
		}

		if (arg === `--json`) {
			options.json = true;
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

function readJsonIfExists(filePath) {
	if (!fs.existsSync(filePath)) {
		return {
			Items: [],
			Sources: [],
		};
	}

	return JSON.parse(fs.readFileSync(filePath, `utf8`));
}

function stringifyJson(data) {
	return JSON.stringify(data, null, `\t`);
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, `${stringifyJson(data)}\n`);
}

function shortHash(value) {
	return crypto.createHash(`sha1`).update(String(value)).digest(`hex`).slice(0, 8);
}

function toDataPath(...parts) {
	return parts.join(`/`);
}

function iconFileNameForUrl(sourceUrl, usedFileNames) {
	const parsedUrl = new URL(sourceUrl);
	const rawName = path.basename(parsedUrl.pathname, path.extname(parsedUrl.pathname));
	const baseName = slugify(rawName) || shortHash(sourceUrl);
	let fileName = `${baseName}${ITEM_ICON_EXTENSION}`;
	const previousUrl = usedFileNames.get(fileName.toLowerCase());

	if (previousUrl && previousUrl !== sourceUrl) {
		fileName = `${baseName}-${shortHash(sourceUrl)}${ITEM_ICON_EXTENSION}`;
	}

	usedFileNames.set(fileName.toLowerCase(), sourceUrl);

	return fileName;
}

function iconDownloadUrl(sourceUrl) {
	const parsedUrl = new URL(sourceUrl);

	parsedUrl.pathname = parsedUrl.pathname.replace(/\.[^./]+$/u, ITEM_ICON_EXTENSION);

	return parsedUrl.toString();
}

function localizeItemIcons(itemData) {
	const usedFileNames = new Map();
	const localPathsBySourceUrl = new Map();
	const downloads = [];

	for (const item of itemData.Items) {
		const sourceUrl = item.iconUrl;

		if (!sourceUrl || localPathsBySourceUrl.has(sourceUrl)) {
			continue;
		}

		const fileName = iconFileNameForUrl(sourceUrl, usedFileNames);
		const relativePath = toDataPath(ITEM_ICON_RELATIVE_DIR, fileName);

		localPathsBySourceUrl.set(sourceUrl, relativePath);
		downloads.push({
			downloadUrl: iconDownloadUrl(sourceUrl),
			relativePath,
			sourceUrl,
		});
	}

	for (const item of itemData.Items) {
		if (item.iconUrl) {
			item.iconUrl = localPathsBySourceUrl.get(item.iconUrl) || item.iconUrl;
		}
	}

	return {
		downloads,
		uniqueIcons: downloads.length,
	};
}

async function mapWithConcurrency(items, concurrency, mapper) {
	const results = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, worker),
	);

	return results;
}

async function downloadIcon(download) {
	const filePath = path.join(ROOT_DIR, download.relativePath);

	if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
		return `skipped`;
	}

	const response = await fetch(download.downloadUrl, {
		headers: {
			Accept: `image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8`,
			Referer: `https://paldb.cc/`,
			'User-Agent': `Paldeck data updater`,
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch ${download.downloadUrl}: ${response.status} ${response.statusText}`);
	}

	const buffer = Buffer.from(await response.arrayBuffer());

	fs.writeFileSync(filePath, buffer);

	return `downloaded`;
}

async function downloadIcons(downloads) {
	fs.mkdirSync(ITEM_ICON_DIR, { recursive: true });

	if (!downloads.length) {
		return {
			downloaded: 0,
			skipped: 0,
		};
	}

	const results = await mapWithConcurrency(downloads, ICON_DOWNLOAD_CONCURRENCY, downloadIcon);

	return {
		downloaded: results.filter(result => result === `downloaded`).length,
		skipped: results.filter(result => result === `skipped`).length,
	};
}

function normalizeComparableItem(item) {
	return {
		id: item.id || ``,
		code: item.code || ``,
		name: item.name || ``,
		nameKey: item.nameKey || ``,
		category: item.category || ``,
		rarity: item.rarity || ``,
		rarityRank: item.rarityRank ?? 0,
		description: item.description || ``,
		iconUrl: item.iconUrl || ``,
		url: item.url || ``,
		source: item.source || ``,
	};
}

function itemChanged(localItem, currentItem) {
	return JSON.stringify(normalizeComparableItem(localItem)) !== JSON.stringify(normalizeComparableItem(currentItem));
}

function mapByCode(items) {
	return new Map((items || []).map(item => [item.code, item]));
}

function compareItems(localData, currentData) {
	const localByCode = mapByCode(localData.Items);
	const currentByCode = mapByCode(currentData.Items);
	const added = currentData.Items.filter(item => !localByCode.has(item.code));
	const removed = localData.Items.filter(item => !currentByCode.has(item.code));
	const changed = currentData.Items
		.filter(item => {
			const localItem = localByCode.get(item.code);

			return localItem && itemChanged(localItem, item);
		})
		.map(item => ({
			current: item,
			local: localByCode.get(item.code),
		}));

	return {
		added,
		changed,
		removed,
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

function printReport(report, options) {
	const mode = options.write ? `write` : `dry-run`;

	console.log(`Palworld item data update against PalDB (${mode})`);
	console.log(`Sources: ${report.summary.sources}`);
	console.log(`Current items: ${report.summary.currentItems}`);
	console.log(`Local items: ${report.summary.localItems}`);
	console.log(`Local icon files: ${report.summary.uniqueIcons}`);
	console.log(`Icons downloaded: ${report.summary.iconsDownloaded}`);
	console.log(`Icons already present: ${report.summary.iconsSkipped}`);
	console.log(`Files ${options.write ? `updated` : `not written`}.`);

	printRows(`Added items`, report.diff.added, options.limit, item => `${item.name} (${item.category}, ${item.rarity})`);
	printRows(`Removed items`, report.diff.removed, options.limit, item => `${item.name} (${item.category}, ${item.rarity})`);
	printRows(
		`Changed items`,
		report.diff.changed,
		options.limit,
		row => `${row.current.name} (${row.current.category}, ${row.current.rarity})`,
	);

	if (!options.write) {
		console.log(`\nRun with --write to update data/itemData.json.`);
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const localData = readJsonIfExists(ITEM_DATA_PATH);
	const currentData = await fetchPaldbItemData();
	const iconPlan = localizeItemIcons(currentData);
	const diff = compareItems(localData, currentData);
	const iconDownloads = options.write ?
		await downloadIcons(iconPlan.downloads) :
		{ downloaded: 0, skipped: 0 };
	const report = {
		diff,
		summary: {
			currentItems: currentData.Items.length,
			iconsDownloaded: iconDownloads.downloaded,
			iconsSkipped: iconDownloads.skipped,
			localItems: localData.Items.length,
			sources: currentData.Sources.length,
			uniqueIcons: iconPlan.uniqueIcons,
		},
	};

	if (options.write) {
		writeJson(ITEM_DATA_PATH, currentData);
	}

	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		printReport(report, options);
	}
}

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});
