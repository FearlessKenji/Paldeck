const PALDB_PALS_URL = `https://paldb.cc/en/Pals`;
const PALDB_IV_URL = `https://paldb.cc/json/iv_en.json`;
const PALDB_BREED_PAIR_URL = `https://paldb.cc/en/api/pal_breed_2`;
const PALDB_BREED_CHILD_URL = `https://paldb.cc/en/api/pal_breed_3`;
const { decodeHtml, stripTags } = require(`./html-text.js`);

const ELEMENT_NAMES = [
	`Neutral`,
	`Fire`,
	`Water`,
	`Electric`,
	`Grass`,
	`Dark`,
	`Dragon`,
	`Ground`,
	`Ice`,
];

const WORK_FILTERS = [
	{ aliases: [`Kindling`], name: `Kindling` },
	{ aliases: [`Watering`], name: `Watering` },
	{ aliases: [`Planting`], name: `Planting` },
	{ aliases: [`GeneratingElectricity`, `Generating Electricity`], name: `Generating Electricity` },
	{ aliases: [`Handiwork`], name: `Handiwork` },
	{ aliases: [`Gathering`], name: `Gathering` },
	{ aliases: [`Lumbering`], name: `Lumbering` },
	{ aliases: [`Mining`], name: `Mining` },
	{ aliases: [`MedicineProduction`, `Medicine Production`], name: `Medicine Production` },
	{ aliases: [`Cooling`], name: `Cooling` },
	{ aliases: [`Transporting`], name: `Transporting` },
	{ aliases: [`Farming`], name: `Farming` },
];

const WORK_ORDER = WORK_FILTERS.map(entry => entry.name);

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);
}

function normalizeKey(value) {
	return String(value || ``).trim().toLowerCase();
}

function normalizeNumber(value) {
	const trimmed = String(value || ``).trim();
	const match = trimmed.match(/^(\d+)([a-z])?$/i);

	if (!match) {
		return trimmed.toLowerCase();
	}

	return `${match[1].padStart(3, `0`)}${(match[2] || ``).toLowerCase()}`;
}

function formatPaldbNumber(value) {
	const trimmed = String(value || ``).trim();
	const match = trimmed.match(/^(\d+)([a-z])?$/i);

	if (!trimmed) {
		return `-1`;
	}

	if (!match) {
		return trimmed;
	}

	return `${match[1].padStart(3, `0`)}${(match[2] || ``).toUpperCase()}`;
}

function splitList(value) {
	return String(value || ``)
		.split(`,`)
		.map(entry => entry.trim())
		.filter(Boolean);
}

function compareElementNames(first, second) {
	const firstIndex = ELEMENT_NAMES.indexOf(first);
	const secondIndex = ELEMENT_NAMES.indexOf(second);
	const firstRank = firstIndex === -1 ? ELEMENT_NAMES.length : firstIndex;
	const secondRank = secondIndex === -1 ? ELEMENT_NAMES.length : secondIndex;

	if (firstRank !== secondRank) {
		return firstRank - secondRank;
	}

	return first.localeCompare(second);
}

function normalizeElement(value) {
	return splitList(value)
		.sort(compareElementNames)
		.join(`, `);
}

function parseSuitabilityEntries(value) {
	return splitList(value)
		.map(entry => {
			const match = entry.match(/^(.*?)(?:\s+(\d+))?$/);
			const name = match?.[1]?.trim() || entry;
			const level = match?.[2] || ``;

			return {
				level,
				name,
			};
		});
}

function normalizeSuitability(value) {
	const entries = parseSuitabilityEntries(value);

	return entries
		.sort((first, second) => {
			const firstIndex = WORK_ORDER.indexOf(first.name);
			const secondIndex = WORK_ORDER.indexOf(second.name);
			const firstRank = firstIndex === -1 ? WORK_ORDER.length : firstIndex;
			const secondRank = secondIndex === -1 ? WORK_ORDER.length : secondIndex;

			if (firstRank !== secondRank) {
				return firstRank - secondRank;
			}

			return first.name.localeCompare(second.name);
		})
		.map(entry => `${entry.name}${entry.level ? ` ${entry.level}` : ``}`)
		.join(`, `);
}

function filterAliasPattern(alias) {
	return escapeRegExp(alias).replace(/\s+/g, `\\s+`);
}

function parseWorkEntries(filtersText) {
	return WORK_FILTERS
		.map(work => {
			for (const alias of work.aliases) {
				const pattern = new RegExp(`(?:^|\\s)${filterAliasPattern(alias)}\\s*(\\d)(?=\\s|$)`, `i`);
				const match = filtersText.match(pattern);

				if (match) {
					return {
						level: match[1],
						name: work.name,
					};
				}
			}

			return null;
		})
		.filter(Boolean);
}

function parseElementEntries(filtersText) {
	return ELEMENT_NAMES.filter(element => {
		const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(element)}(?=\\s|$)`, `i`);

		return pattern.test(filtersText);
	});
}

function isTowerCode(value) {
	return /_tower$/i.test(String(value || ``));
}

function shouldReplaceIvRow(existing, next) {
	if (!existing) {
		return true;
	}

	if (isTowerCode(existing.Code) && !isTowerCode(next.Code)) {
		return true;
	}

	return false;
}

async function fetchText(url) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	return response.text();
}

async function fetchJson(url) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
	}

	return response.json();
}

function parsePaldbCards(html) {
	const cardPattern = /<div class="col"\s+data-filters="([^"]*)">([\s\S]*?)(?=<div class="col"\s+data-filters="|<script|\s*<\/div>\s*<\/main>|$)/gi;
	const cards = [];

	for (const match of html.matchAll(cardPattern)) {
		const filtersText = decodeHtml(match[1]).trim();
		const body = match[2];
		const nameMatch = body.match(/<a[^>]*class="itemname"[^>]*>([\s\S]*?)<\/a>/i);
		const numberMatch = body.match(/class="text-white-50\s+small">\s*#([^<]+)<\/span>/i);

		if (!nameMatch || !numberMatch) {
			continue;
		}

		const workEntries = parseWorkEntries(filtersText);
		const elements = parseElementEntries(filtersText);

		cards.push({
			element: elements.join(`, `),
			name: stripTags(nameMatch[1]),
			number: formatPaldbNumber(numberMatch[1]),
			suitability: workEntries.map(entry => `${entry.name} ${entry.level}`).join(`, `),
		});
	}

	return cards;
}

function buildCurrentPaldbRows(cardRows, ivRows) {
	const ivRowsByName = new Map();
	const rowsByName = new Map();

	for (const row of ivRows) {
		const name = row.NameEn || row.Name;

		if (!name) {
			continue;
		}

		const key = normalizeKey(name);

		if (!shouldReplaceIvRow(ivRowsByName.get(key), row)) {
			continue;
		}

		ivRowsByName.set(key, row);
		rowsByName.set(key, {
			breedingCode: row.Code ? String(row.Code) : ``,
			breedingId: row.Code ? String(row.Code).toLowerCase() : ``,
			ignoreCombi: Boolean(row.IgnoreCombi),
			name,
			number: formatPaldbNumber(row.Id),
		});
	}

	for (const card of cardRows) {
		const key = normalizeKey(card.name);
		const existing = rowsByName.get(key) || {};

		rowsByName.set(key, {
			...existing,
			...card,
			name: card.name,
		});
	}

	return [...rowsByName.values()].sort((first, second) => {
		const numberComparison = normalizeNumber(first.number).localeCompare(normalizeNumber(second.number));

		if (numberComparison !== 0) {
			return numberComparison;
		}

		return first.name.localeCompare(second.name);
	});
}

async function fetchPaldbData() {
	const [palsHtml, ivRows] = await Promise.all([
		fetchText(PALDB_PALS_URL),
		fetchJson(PALDB_IV_URL),
	]);
	const paldbCardRows = parsePaldbCards(palsHtml);
	const currentRows = buildCurrentPaldbRows(paldbCardRows, ivRows);

	return {
		currentRows,
		ivRows,
		paldbCardRows,
	};
}

function mapByName(rows) {
	return new Map(rows.map(row => [normalizeKey(row.name), row]));
}

function visiblePals(palFile) {
	return (palFile.Pals || []).filter(row => !row.hidden);
}

function hasChangedField(changes, field, localValue, currentValue, normalizer = value => String(value || ``), options = {}) {
	if (options.ignoreBlankCurrent && !String(currentValue || ``).trim()) {
		return;
	}

	if (normalizer(localValue) === normalizer(currentValue)) {
		return;
	}

	changes.push({
		current: currentValue || ``,
		field,
		local: localValue || ``,
	});
}

function compareData(currentRows, localPalFile, _localBreedingFile, options = {}) {
	const localPals = visiblePals(localPalFile);
	const localPalsByName = mapByName(localPals);
	const currentByName = mapByName(currentRows);
	const added = currentRows.filter(row => !localPalsByName.has(normalizeKey(row.name)));
	const removed = localPals.filter(row => !currentByName.has(normalizeKey(row.name)));
	const changedPals = [];
	const changedBreeding = [];

	for (const localPal of localPals) {
		const current = currentByName.get(normalizeKey(localPal.name));

		if (!current) {
			continue;
		}

		const changes = [];

		hasChangedField(changes, `number`, localPal.number, current.number, normalizeNumber, options);
		hasChangedField(changes, `element`, localPal.element, current.element, normalizeElement, options);
		hasChangedField(changes, `suitability`, localPal.suitability, current.suitability, normalizeSuitability, options);

		if (changes.length) {
			changedPals.push({
				changes,
				name: localPal.name,
			});
		}
	}

	for (const localPal of localPals) {
		const current = currentByName.get(normalizeKey(localPal.name));

		if (!current) {
			continue;
		}

		const changes = [];

		hasChangedField(changes, `breeding.id`, localPal.breeding?.id, current.breedingId, normalizeKey, options);

		if (changes.length) {
			changedBreeding.push({
				changes,
				name: localPal.name,
			});
		}
	}

	return {
		added,
		changedBreeding,
		changedPals,
		removed,
	};
}

module.exports = {
	ELEMENT_NAMES,
	PALDB_BREED_CHILD_URL,
	PALDB_BREED_PAIR_URL,
	PALDB_IV_URL,
	PALDB_PALS_URL,
	compareData,
	fetchPaldbData,
	mapByName,
	normalizeElement,
	normalizeKey,
	normalizeNumber,
	normalizeSuitability,
	splitList,
	visiblePals,
};
