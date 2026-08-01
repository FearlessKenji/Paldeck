// Fetches and normalizes PalDB item catalogs, details, drops, properties, and genuine crafting recipes.
const { URL } = require(`node:url`);
const { decodeHtml, stripTags: stripHtmlTags } = require(`./html-text.js`);
const palFile = require(`../../data/palData.json`);

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
const ITEM_DETAIL_CONCURRENCY = 12;
const CANONICAL_PAL_NAMES = palFile.Pals
	.filter(pal => !pal.hidden)
	.map(pal => pal.name)
	.sort((first, second) => second.length - first.length);

function normalizeWhitespace(value) {
	return String(value || ``).replace(/\s+/g, ` `).trim();
}

function stripTags(value) {
	return normalizeWhitespace(stripHtmlTags(value, ` `));
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

function itemDetailPathFromHref(href) {
	return new URL(decodeHtml(href), PALDB_BASE_URL).pathname.replace(/^\/en\//, ``);
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
		detailPath: itemDetailPathFromHref(nameMatch[2]),
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

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);
}

function detailSection(html, title) {
	const heading = new RegExp(`<h5 class="card-title text-info">\\s*${escapeRegExp(title)}\\s*</h5>`, `i`);
	const match = heading.exec(html);

	if (!match) {
		return ``;
	}

	const remainder = html.slice(match.index + match[0].length);
	const nextCard = remainder.search(/<div class="card mt-3">/i);

	return nextCard >= 0 ? remainder.slice(0, nextCard) : remainder;
}

function numberIfNumeric(value) {
	const normalized = String(value || ``).replace(/,/g, ``).trim();

	return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : value;
}

function statKey(label) {
	const normalized = slugify(label);

	return normalized.replace(/-([a-z0-9])/g, (_match, character) => character.toUpperCase());
}

function parseItemStats(html, itemCode = ``) {
	let section = detailSection(html, `Stats`);
	const rawCode = itemCode.replace(/^Items\//, ``);
	const codeMarker = rawCode ? new RegExp(`<div>Code</div>\\s*<div>${escapeRegExp(rawCode)}</div>`, `i`).exec(html) : null;

	if (codeMarker) {
		const beforeCode = html.slice(0, codeMarker.index);
		const statsHeading = [...beforeCode.matchAll(/<h5 class="card-title text-info"[^>]*>\s*Stats\s*<\/h5>/gi)].at(-1);

		if (statsHeading) {
			section = html.slice(statsHeading.index + statsHeading[0].length, codeMarker.index + codeMarker[0].length);
		}
	}
	const stats = {};
	const rowPattern = /<div class="d-flex justify-content-between p-2 align-items-center border-bottom">\s*<div>([\s\S]*?)<\/div>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/gi;

	for (const match of section.matchAll(rowPattern)) {
		const label = stripTags(match[1]);
		const visibleSpanValue = match[2].match(/>([^<>]+)<\/span>\s*$/)?.[1];
		const value = stripTags(visibleSpanValue || match[2]);
		const key = statKey(label);

		if (key && value && ![`rarity`, `type`, `code`].includes(key)) {
			stats[key] = numberIfNumeric(value);
		}

		if (label === `Gold Coin`) {
			const tooltip = match[2].match(/data-bs-title="([^"]+)"/i)?.[1] || ``;
			const buyPrice = tooltip.match(/Buy:\s*([\d,]+)/i)?.[1];
			const sellPrice = tooltip.match(/Sell:\s*([\d,]+)/i)?.[1];

			if (buyPrice) {
				stats.buyPrice = numberIfNumeric(buyPrice);
			}

			if (sellPrice) {
				stats.sellPrice = numberIfNumeric(sellPrice);
			}
		}
	}

	return stats;
}

function parseDetailRows(section) {
	const values = {};
	const rowPattern = /<div class="d-flex justify-content-between p-2 align-items-center border-bottom">\s*<div>([\s\S]*?)<\/div>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/gi;

	for (const match of section.matchAll(rowPattern)) {
		const key = statKey(stripTags(match[1]));
		const visibleSpanValue = match[2].match(/>([^<>]+)<\/span>\s*$/)?.[1];
		const value = stripTags(visibleSpanValue || match[2]);

		if (key && value) {
			values[key] = numberIfNumeric(value);
		}
	}

	return values;
}

function parseItemProperties(html) {
	return parseDetailRows(detailSection(html, `Others`));
}

function parseDroppedBy(html) {
	const section = detailSection(html, `Dropped By`);
	const drops = [];
	const seen = new Set();
	const rowPattern = /<tr><td>([\s\S]*?)<td>\s*<small class="itemQuantity">([\s\S]*?)<\/small>\s*<td>([^<]*)<\/tr>/gi;

	for (const match of section.matchAll(rowPattern)) {
		const sourceLabel = stripTags(match[1]);
		const quantity = stripTags(match[2]);
		const probability = stripTags(match[3]);
		const levelMatch = sourceLabel.match(/\s+Lv\.(\d+)$/i);
		const level = levelMatch ? Number(levelMatch[1]) : undefined;
		const labelWithoutLevel = sourceLabel.replace(/\s+Lv\.\d+$/i, ``);
		const rampaging = /^Rampaging\s+/i.test(labelWithoutLevel);
		const labelWithoutVariant = labelWithoutLevel.replace(/^Rampaging\s+/i, ``);
		const canonicalPal = CANONICAL_PAL_NAMES.find(name =>
			labelWithoutVariant === name || labelWithoutVariant.endsWith(` ${name}`),
		);
		const pal = canonicalPal || labelWithoutVariant;
		const titled = canonicalPal && labelWithoutVariant !== canonicalPal;
		const variant = rampaging ? `Rampaging` : titled ? `Alpha` : level ? `World Tree` : undefined;
		const key = `${pal}\0${variant || ``}\0${level || ``}\0${quantity}\0${probability}`;

		if (!sourceLabel || !pal || !quantity || !probability || seen.has(key)) {
			continue;
		}

		seen.add(key);
		drops.push({
			pal,
			...(variant ? { variant } : {}),
			...(level !== undefined ? { level } : {}),
			quantity,
			probability,
		});
	}

	return drops;
}

function parseCraftingRecipes(html, itemCode) {
	const recipes = [];

	for (const table of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
		const precedingHtml = html.slice(0, table.index);
		const headings = [...precedingHtml.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
		const sectionName = stripTags(headings.at(-1)?.[1] || ``);

		// PalDB uses similar item/currency rows for shops and exchanges. Only production sections are recipes.
		if (!/^(?:Production|Crafting Materials)$/iu.test(sectionName)) {
			continue;
		}

		for (const row of table[0].split(/<tr><td>/i).slice(1)) {
			const product = /<td>\s*<a class="itemname"[^>]*data-hover="\?s=([^"]+)"[\s\S]*?<\/a>/i.exec(row);

			if (!product) {
				continue;
			}

			const productCode = decodeUriComponentSafe(decodeHtml(product[1]));

			if (productCode !== itemCode) {
				continue;
			}

			const materials = row.slice(0, product.index);
			const afterProduct = row.slice(product.index + product[0].length);
			const ingredients = [];
			const ingredientPattern = /<a class="itemname"[^>]*>([\s\S]*?)<\/a>\s*<small class="itemQuantity">([\s\S]*?)<\/small>/gi;

			for (const ingredient of materials.matchAll(ingredientPattern)) {
				ingredients.push({
					name: stripTags(ingredient[1]),
					quantity: stripTags(ingredient[2]),
				});
			}

			if (ingredients.length) {
				const requirement = /<td>([\s\S]*?)(?=<\/table>|$)/i.exec(afterProduct)?.[1] || ``;
				recipes.push({ ingredients, requirement: stripTags(requirement) });
			}
		}
	}

	return recipes;
}

function parseItemDetails(html, itemCode = ``) {
	return {
		recipes: parseCraftingRecipes(html, itemCode),
		droppedBy: parseDroppedBy(html),
		stats: parseItemStats(html, itemCode),
		properties: parseItemProperties(html),
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

	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

	return results;
}

async function fetchPaldbItemDetails(items) {
	return mapWithConcurrency(items, ITEM_DETAIL_CONCURRENCY, async item => {
		try {
			const url = new URL(item.detailPath, PALDB_BASE_URL);
			url.searchParams.set(`s`, item.code);
			const html = await fetchText(url);

			return { ...item, ...parseItemDetails(html, item.code) };
		} catch (error) {
			// Keep a usable catalog entry when PalDB has a malformed or temporarily unavailable detail page.
			console.warn(`Skipping item details for ${item.name}: ${error.message}`);
			return {
				...item,
				droppedBy: item.droppedBy || [],
				recipes: item.recipes || [],
				stats: item.stats || {},
				properties: item.properties || {},
			};
		}
	});
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
	fetchPaldbItemDetails,
	itemIdFromCode,
	parseItemCards,
	parseItemDetails,
	slugify,
};
