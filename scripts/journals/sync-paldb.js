// Builds journal item records while preserving the installed game's note-texture asset identity.
const { Buffer } = require(`node:buffer`);
const fs = require(`node:fs`);
const path = require(`node:path`);
const sharp = require(`sharp`);
const { compactItemData, resolvedItemData } = require(`../../utils/itemData.js`);
const { fetchCached, loadMap, renderMap } = require(`../lib/maps/item-map-rendering.js`);

const ROOT = path.resolve(__dirname, `..`, `..`);
const CACHE = path.join(ROOT, `tmp`, `paldb-map-cache`);
const ITEM_DATA_PATH = process.env.PALDECK_ITEM_DATA_PATH || path.join(ROOT, `data`, `itemData.json`);
const OUTPUT_DIRECTORY = process.env.PALDECK_MAP_OUTPUT_DIR || path.join(ROOT, `data`, `item-maps`);
const ICON_DIRECTORY = process.env.PALDECK_JOURNAL_ICON_OUTPUT_DIR || path.join(ROOT, `data`, `items`, `journals`);
const REGIONS = {
	palpagos: {
		label: `Palpagos`, description: `the Palpagos Islands`, script: `https://paldb.cc/js/map_data_en.js?_=1783945617`,
		tileDirectory: `image/map8`, crop: [0, 0, 1024, 1024],
	},
	worldtree: {
		label: `World Tree`, description: `the World Tree`, script: `https://paldb.cc/js/treemap_data_en.js?_=1783945617`,
		tileDirectory: `image/treemap8`, crop: [0, 112, 1024, 912],
	},
};

function slug(value) {
	return value.toLowerCase().replace(/[’']/gu, ``).replace(/[^a-z0-9]+/gu, `-`).replace(/^-|-$/gu, ``);
}

function displayName(rawName) {
	return rawName.replace(/’/gu, `'`).replace(/:$/u, ``).replace(/^Castaway's Journal Day (\d+)$/u, `Castaway's Journal - Day $1`);
}

function gameTextureAsset(page) {
	const match = page.match(/https:\/\/cdn\.paldb\.cc\/image\/(Pal\/Texture\/Note\/[^"'<> ]+)\.webp/iu);
	return match ? `Pal/Content/${match[1]}` : null;
}

function verifyInstalledAsset(asset) {
	const manifestPath = process.env.PALWORLD_MANIFEST_PATH;
	if (!manifestPath) {
		return;
	}
	const manifest = fs.readFileSync(manifestPath, `utf8`);
	if (!manifest.includes(`${asset}.uasset`) || !manifest.includes(`${asset}.uexp`)) {
		throw new Error(`Installed Palworld build does not contain ${asset}.`);
	}
}

async function journalArtwork(marker, itemSlug, refreshArtwork) {
	const pageUrl = `https://paldb.cc/en/${marker.href}`;
	const page = (await fetchCached(pageUrl, CACHE)).toString(`utf8`);
	const match = page.match(/https:\/\/cdn\.paldb\.cc\/image\/Pal\/Texture\/Note\/[^"'<> ]+\.webp/iu);
	if (!match) {
		throw new Error(`No journal artwork found for ${marker.item}.`);
	}
	const gameAsset = gameTextureAsset(page);
	verifyInstalledAsset(gameAsset);
	const relativePath = `data/items/journals/${itemSlug}.png`;
	if (refreshArtwork) {
		const artworkUrl = match[0].replaceAll(`&amp;`, `&`);
		// PalDB's image host requires the owning journal page as the referrer.
		const response = await fetch(artworkUrl, { headers: { Referer: pageUrl, 'User-Agent': `Mozilla/5.0` } });
		if (!response.ok) {
			throw new Error(`Failed to fetch artwork for ${marker.item}: ${response.status}`);
		}
		const source = Buffer.from(await response.arrayBuffer());
		fs.mkdirSync(ICON_DIRECTORY, { recursive: true });
		await sharp(source).png({ compressionLevel: 9 }).toFile(path.join(ICON_DIRECTORY, `${itemSlug}.png`));
	}
	return { gameAsset, relativePath };
}

function journalRecord({ regionKey, region, marker, index, artwork }) {
	const name = displayName(marker.item);
	const itemSlug = slug(name);
	const mapName = `journal-${regionKey}-${itemSlug}.png`;
	return {
		id: `journal-${regionKey}-${itemSlug}`,
		code: `Collections/Journals/${region.label.replaceAll(` `, ``)}/${itemSlug}`,
		name,
		nameKey: `journal-${regionKey}-${itemSlug}`,
		category: `Collectible`, rarity: `Common`, rarityRank: 0,
		description: `A journal collectible found in ${region.description}.`,
		iconUrl: artwork.relativePath,
		source: `Collectible`, droppedBy: [],
		stats: { rank: 0 },
		detailPath: marker.href || itemSlug,
		recipes: [],
		properties: { iconName: `TechnologyBook_G1`, typeA: `Collectible`, typeB: `Collectible`, sortId: 10100 + index },
		localOnly: true,
		journalEntry: { region: regionKey, sourceName: marker.item, textureAsset: artwork.gameAsset },
		acquisition: {
			sources: [{ type: `Locations`, entries: [{ location: `${region.label} location` }] }],
			map: `data/item-maps/${mapName}`,
			mapSources: { map: regionKey, markers: [{ type: `Journals`, item: marker.item }] },
		},
	};
}

async function main() {
	const write = process.argv.includes(`--write`);
	const refreshArtwork = process.argv.includes(`--refresh-artwork`);
	const maps = Object.fromEntries(await Promise.all(Object.entries(REGIONS).map(async ([key, settings]) =>
		[key, await loadMap({ key, ...settings }, CACHE)],
	)));
	const records = [];
	for (const [regionKey, region] of Object.entries(REGIONS)) {
		const markers = maps[regionKey].markers.filter(marker => marker.type === `Journals` && marker.item);
		for (const marker of markers) {
			const itemSlug = slug(displayName(marker.item));
			const artwork = await journalArtwork(marker, itemSlug, refreshArtwork);
			records.push(journalRecord({ regionKey, region, marker, index: records.length, artwork }));
		}
		console.log(`${region.label}: ${markers.length} journals`);
	}
	const ids = new Set(records.map(record => record.id));
	if (ids.size !== records.length) {
		throw new Error(`Journal names did not produce unique item IDs.`);
	}
	if (!write) {
		console.log(`Dry run complete. Use --write to update item data and maps.`);
		return;
	}

	const sourceData = JSON.parse(fs.readFileSync(ITEM_DATA_PATH, `utf8`));
	const itemData = resolvedItemData(sourceData);
	itemData.Items = itemData.Items.filter(item => !item.journalEntry).concat(records);
	const collectionIcons = {
		'Palpagos Journals': records.find(item => item.name === `Castaway's Journal - Day XX`)?.iconUrl,
		'World Tree Journals': records.find(item => item.name === `Zenara's Diary - 1`)?.iconUrl,
	};
	for (const item of itemData.Items) {
		if (collectionIcons[item.name]) {
			item.iconUrl = collectionIcons[item.name];
		}
	}
	fs.writeFileSync(ITEM_DATA_PATH, `${JSON.stringify(compactItemData(itemData), null, `\t`)}\n`);
	fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
	for (const record of records) {
		const regionKey = record.journalEntry.region;
		const marker = maps[regionKey].markers.find(value => value.type === `Journals` && value.item === record.journalEntry.sourceName);
		const target = path.join(OUTPUT_DIRECTORY, path.basename(record.acquisition.map));
		// Existing maps remain deterministic; opt into recompression when only item artwork changed.
		if (!fs.existsSync(target) || process.argv.includes(`--refresh-maps`)) {
			await renderMap(maps[regionKey], [{ label: `Journal`, color: `#ef4444`, style: `normal`, markers: [marker] }], target, regionKey === `worldtree`);
		}
	}
	console.log(`Wrote ${records.length} individual journal items and maps.`);
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
