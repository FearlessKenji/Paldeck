const { URL } = require(`node:url`);

const PALDB_ITEM_CATEGORY_SOURCES = [
	{ category: `Weapon`, slug: `Weapon` },
	{ category: `Sphere`, slug: `Sphere` },
	{ category: `Sphere Module`, slug: `Sphere_Module` },
	{ category: `Armor`, slug: `Armor` },
	{ category: `Accessory`, slug: `Accessory` },
	{ category: `Material`, slug: `Material` },
	{ category: `Consumable`, slug: `Consumable` },
	{ category: `Ammo`, slug: `Ammo` },
	{ category: `Ingredient`, slug: `Ingredient` },
	{ category: `Key Items`, slug: `Key_Items` },
	{ category: `Glider`, slug: `Glider` },
	{ category: `Schematic`, slug: `Schematic` },
];

const PALDB_BASE_URL = `https://paldb.cc/en/`;

function decodeHtml(value) {
	return String(value || ``)
		.replace(/&amp;/g, `&`)
		.replace(/&quot;/g, `"`)
		.replace(/&#039;/g, `'`)
		.replace(/&lt;/g, `<`)
		.replace(/&gt;/g, `>`);
}

function normalizeWhitespace(value) {
	return String(value || ``).replace(/\s+/g, ` `).trim();
}

function stripTags(value) {
	return normalizeWhitespace(decodeHtml(String(value || ``).replace(/<[^>]+>/g, ` `)));
}

function slugify(value) {
	return String(value || ``)
		.replace(/([a-z0-9])([A-Z])/g, `$1-$2`)
		.replace(/([A-Z]+)([A-Z][a-z])/g, `$1-$2`)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, `-`)
		.replace(/^-+|-+$/g, ``);
}

function decodeUriComponentSafe(value) {
	try {
		return decodeURIComponent(value);
	} catch (_error) {
		return value;
	}
}

function itemIdFromCode(code, fallbackName) {
	const codePart = String(code || ``).replace(/^Items\//i, ``);

	return slugify(codePart) || slugify(fallbackName);
}

function itemUrlFromHref(href) {
	return new URL(decodeHtml(href), PALDB_BASE_URL).toString();
}

function parseItemCard(card, source) {
	const nameMatch = card.match(/<a class="itemname" data-hover="\?s=([^"]+)" href="([^"]+)">([\s\S]*?)<\/a>/);

	if (!nameMatch) {
		return null;
	}

	const categoryMatch = card.match(/<span class="me-auto"[^>]*>([^<]+)<\/span>/);
	const rarityMatch = card.match(/hover_text_rarity(\d+)"[^>]*>([^<]+)<\/span>/);
	const iconMatch = card.match(/<img loading="lazy" src="([^"]+)"[^>]*class="[^"]*size128/);
	const descriptionMatch = card.match(/<div class="card-body py-2">\s*<div>([\s\S]*?)<\/div>\s*<\/div>/);
	const name = stripTags(nameMatch[3]);
	const code = decodeUriComponentSafe(decodeHtml(nameMatch[1]));
	const id = itemIdFromCode(code, name);

	return {
		id,
		code,
		name,
		nameKey: slugify(name) || id,
		category: stripTags(categoryMatch?.[1] || source.category),
		rarity: stripTags(rarityMatch?.[2] || ``),
		rarityRank: Number.parseInt(rarityMatch?.[1] || `0`, 10),
		description: stripTags(descriptionMatch?.[1] || ``),
		iconUrl: decodeHtml(iconMatch?.[1] || ``),
		url: itemUrlFromHref(nameMatch[2]),
		source: source.slug,
	};
}

function parseItemCards(html, source) {
	return html
		.split(`<div class="col"><div class="card itemPopup">`)
		.slice(1)
		.map(card => parseItemCard(card, source))
		.filter(Boolean);
}

async function fetchText(url) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	return response.text();
}

function assertUniqueItems(items, field) {
	const seen = new Map();
	const duplicates = [];

	for (const item of items) {
		const value = item[field];

		if (seen.has(value)) {
			duplicates.push({
				field,
				first: seen.get(value).name,
				second: item.name,
				value,
			});
			continue;
		}

		seen.set(value, item);
	}

	if (duplicates.length) {
		const sample = duplicates
			.slice(0, 5)
			.map(duplicate => `${duplicate.field} ${duplicate.value}: ${duplicate.first}, ${duplicate.second}`)
			.join(`; `);

		throw new Error(`Found duplicate item ${field} values: ${sample}`);
	}
}

async function fetchPaldbItemData() {
	const items = [];
	const sources = [];

	for (const source of PALDB_ITEM_CATEGORY_SOURCES) {
		const url = `${PALDB_BASE_URL}${source.slug}`;
		const html = await fetchText(url);
		const sourceItems = parseItemCards(html, source);

		sources.push({
			category: source.category,
			slug: source.slug,
			url,
			count: sourceItems.length,
		});
		items.push(...sourceItems);
	}

	assertUniqueItems(items, `id`);
	assertUniqueItems(items, `code`);

	return {
		Sources: sources,
		Items: items,
	};
}

module.exports = {
	PALDB_ITEM_CATEGORY_SOURCES,
	fetchPaldbItemData,
	itemIdFromCode,
	parseItemCards,
	slugify,
};
