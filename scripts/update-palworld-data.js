const fs = require(`node:fs`);
const path = require(`node:path`);
const {
	ELEMENT_NAMES,
	PALDB_IV_URL,
	PALDB_PALS_URL,
	fetchPaldbData,
	mapByName,
	normalizeKey,
	normalizeNumber,
	normalizeSuitability,
	splitList,
	visiblePals,
} = require(`./lib/paldb-data.js`);

const ROOT_DIR = path.resolve(__dirname, `..`);
const PAL_DATA_PATH = path.join(ROOT_DIR, `data`, `palData.json`);

function parseArgs(argv) {
	const options = {
		allowBlankFields: false,
		limit: 25,
		write: false,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === `--write`) {
			options.write = true;
			continue;
		}

		if (arg === `--allow-blank-fields`) {
			options.allowBlankFields = true;
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
		.replace(/\[\n(\t+)(\d+),\n\1(\d+),\n\1(\d+)\n\t*\]/g, `[$2, $3, $4]`)
		.replace(/\[\n(\t+)"([^"\n]+)",\n\1"([^"\n]+)",\n\1"([^"\n]+)"\n\t*\]/g, `["$2", "$3", "$4"]`);
}

function writeJson(filePath, data) {
	fs.writeFileSync(filePath, `${stringifyJson(data)}\n`);
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
		return colors[element];
	}

	const color = averageElementColor(element, colors);
	colors[element] = color;
	paletteAdditions.push({
		color,
		element,
	});

	return color;
}

function findPaletteKeyForElement(element, colors, preferredElement = ``) {
	const signature = elementSignature(element);

	if (!signature) {
		return ``;
	}

	const preferredKey = formatElementKey(preferredElement);

	if (elementSignature(preferredKey) === signature && isRgbArray(colors[preferredKey])) {
		return preferredKey;
	}

	const sourceKey = formatElementKey(element);

	if (isRgbArray(colors[sourceKey])) {
		return sourceKey;
	}

	return Object.keys(colors)
		.find(key => elementSignature(key) === signature && isRgbArray(colors[key])) || sourceKey;
}

function shouldSkipBlank(field, currentValue, options, skippedBlankFields, name) {
	if (options.allowBlankFields || String(currentValue || ``).trim()) {
		return false;
	}

	skippedBlankFields.push({
		field,
		name,
	});

	return true;
}

function setField(row, field, currentValue, normalizer, changes, sourceName = row.name) {
	const localValue = row[field];

	if (normalizer(localValue) === normalizer(currentValue)) {
		return;
	}

	changes.push({
		current: currentValue || ``,
		field,
		local: localValue || ``,
		name: sourceName,
	});
	row[field] = currentValue || ``;
}

function removeColorOverride(row, changes) {
	if (!Object.prototype.hasOwnProperty.call(row, `color`)) {
		return;
	}

	changes.push({
		current: `(palette)`,
		field: `color`,
		local: row.color || ``,
		name: row.name,
	});
	delete row.color;
}

function updatePalData(palFile, currentByName, options) {
	const colors = palFile.Colors?.[0] || {};
	const changes = [];
	const skippedBlankFields = [];
	const paletteAdditions = [];
	const missingFromPaldb = [];

	for (const pal of visiblePals(palFile)) {
		const current = currentByName.get(normalizeKey(pal.name));

		if (!current) {
			missingFromPaldb.push(pal);
			continue;
		}

		if (!shouldSkipBlank(`number`, current.number, options, skippedBlankFields, pal.name)) {
			setField(pal, `number`, current.number, normalizeNumber, changes);
		}

		if (!shouldSkipBlank(`element`, current.element, options, skippedBlankFields, pal.name)) {
			const element = findPaletteKeyForElement(current.element, colors, pal.element);

			ensurePaletteColor(element, colors, paletteAdditions);
			if (formatElementKey(pal.element) !== element) {
				changes.push({
					current: element,
					field: `element`,
					local: pal.element || ``,
					name: pal.name,
				});
				pal.element = element;
			}
		}

		removeColorOverride(pal, changes);

		if (!shouldSkipBlank(`suitability`, current.suitability, options, skippedBlankFields, pal.name)) {
			setField(pal, `suitability`, current.suitability, normalizeSuitability, changes);
		}
	}

	return {
		changes,
		missingFromPaldb,
		paletteAdditions,
		skippedBlankFields,
	};
}

function setBreedingField(pal, field, currentValue, normalizer, changes) {
	const localValue = pal.breeding?.[field];

	if (normalizer(localValue) === normalizer(currentValue)) {
		return;
	}

	pal.breeding = {
		...(pal.breeding || {}),
		[field]: currentValue || ``,
	};
	changes.push({
		current: currentValue || ``,
		field: `breeding.${field}`,
		local: localValue || ``,
		name: pal.name,
	});
}

function updatePalBreedingMetadata(palFile, currentByName, options) {
	const changes = [];
	const missingFromPaldb = [];
	const skippedBlankFields = [];

	for (const pal of visiblePals(palFile)) {
		const current = currentByName.get(normalizeKey(pal.name));

		if (!current) {
			missingFromPaldb.push(pal);
			continue;
		}

		if (!shouldSkipBlank(`breeding.id`, current.breedingId, options, skippedBlankFields, pal.name)) {
			setBreedingField(pal, `id`, current.breedingId, normalizeKey, changes);
		}
	}

	return {
		changes,
		missingFromPaldb,
		skippedBlankFields,
	};
}

function formatValue(value) {
	if (Array.isArray(value)) {
		return `[${value.join(`, `)}]`;
	}

	return value || `(blank)`;
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

function formatChange(change) {
	return `${change.name}: ${change.field}: ${formatValue(change.local)} -> ${formatValue(change.current)}`;
}

function printReport(report, options) {
	const mode = options.write ? `write` : `dry-run`;

	console.log(`Palworld data update against PalDB (${mode})`);
	console.log(`Sources:`);
	console.log(`- ${PALDB_PALS_URL}`);
	console.log(`- ${PALDB_IV_URL}`);
	console.log(`Local visible palData rows: ${report.summary.localPalData}`);
	console.log(`Local hidden placeholder rows: ${report.summary.localHiddenPlaceholders}`);
	console.log(`Local Pal breeding metadata rows: ${report.summary.localBreedingMetadata}`);
	console.log(`Current merged PalDB rows: ${report.summary.currentRows}`);
	console.log(`Files ${options.write ? `updated` : `not written`}.`);

	printRows(`palData field updates`, report.palData.changes, options.limit, formatChange);
	printRows(`palette additions`, report.palData.paletteAdditions, options.limit, row => `${row.element}: ${formatValue(row.color)}`);
	printRows(`breeding field updates`, report.breeding.changes, options.limit, formatChange);
	printRows(`PalDB-only Pals not auto-added`, report.added, options.limit, row => `#${row.number} ${row.name}`);
	printRows(`local palData rows missing from PalDB`, report.palData.missingFromPaldb, options.limit, row => `#${row.number} ${row.name}`);
	printRows(
		`blank PalDB fields skipped`,
		report.skippedBlankFields,
		options.limit,
		row => `${row.name}: ${row.field}`,
	);

	if (!options.write) {
		console.log(`\nRun with --write to apply these safe-field updates.`);
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const palFile = readJson(PAL_DATA_PATH);
	const { currentRows } = await fetchPaldbData();
	const currentByName = mapByName(currentRows);
	const localVisiblePals = visiblePals(palFile);
	const hiddenPlaceholderRows = palFile.Pals.filter(pal => pal.hidden && pal.placeholder);
	const localPalsByName = mapByName(localVisiblePals);
	const added = currentRows.filter(row => !localPalsByName.has(normalizeKey(row.name)));
	const palData = updatePalData(palFile, currentByName, options);
	const breeding = updatePalBreedingMetadata(palFile, currentByName, options);
	const report = {
		added,
		breeding,
		palData,
		skippedBlankFields: [
			...palData.skippedBlankFields,
			...breeding.skippedBlankFields,
		],
		summary: {
			currentRows: currentRows.length,
			localBreedingMetadata: palFile.Pals.filter(pal => pal.breeding).length,
			localHiddenPlaceholders: hiddenPlaceholderRows.length,
			localPalData: localVisiblePals.length,
			localPalDataRows: palFile.Pals.length,
		},
	};

	if (options.write) {
		writeJson(PAL_DATA_PATH, palFile);
	}

	printReport(report, options);
}

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});
