#!/usr/bin/env node

// Audits locally displayed Pal facts against the decoded data from the installed Steam build.
/* eslint-disable complexity, max-params, max-statements, max-statements-per-line -- the linear CLI audit keeps each comparison beside its source field. */
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const palFile = require(`../../data/palData.json`);
const { steamBuildId } = require(`../../utils/itemAvailabilityAudit.js`);

const WORK_FIELDS = [
	[`emitFlame`, `Kindling`],
	[`watering`, `Watering`],
	[`seeding`, `Planting`],
	[`generateElectricity`, `Generating Electricity`],
	[`handcraft`, `Handiwork`],
	[`collection`, `Gathering`],
	[`deforest`, `Lumbering`],
	[`mining`, `Mining`],
	[`produceMedicine`, `Medicine Production`],
	[`cool`, `Cooling`],
	[`transport`, `Transporting`],
	[`monsterFarm`, `Farming`],
];
const ELEMENT_NAMES = {
	Earth: `Ground`,
	Electricity: `Electric`,
	Leaf: `Grass`,
	Normal: `Neutral`,
};
const ELEMENT_ORDER = [`Neutral`, `Fire`, `Water`, `Electric`, `Grass`, `Dark`, `Dragon`, `Ground`, `Ice`];

function optionValue(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
}

function firstExisting(candidates) {
	return candidates.filter(Boolean).map(candidate => path.resolve(candidate)).find(candidate => fs.existsSync(candidate));
}

function configuration() {
	const manifest = firstExisting([
		optionValue(`--steam-manifest`),
		process.env.PALWORLD_STEAM_MANIFEST,
		String.raw`B:\SteamLibrary\steamapps\appmanifest_1623730.acf`,
		String.raw`C:\Program Files (x86)\Steam\steamapps\appmanifest_1623730.acf`,
	]);
	if (!manifest) {throw new Error(`Palworld Steam manifest not found.`);}
	const buildId = steamBuildId(fs.readFileSync(manifest, `utf8`));
	const extraction = firstExisting([
		optionValue(`--extraction`),
		process.env.PALWORLD_EXTRACTION,
		path.join(process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `extractions`, buildId),
	]);
	if (!extraction) {throw new Error(`Decoded extraction for installed build ${buildId} not found.`);}
	const snapshot = firstExisting([
		optionValue(`--snapshot`),
		path.join(process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `snapshots`, `items-${buildId}.json`),
	]);
	if (!snapshot) {throw new Error(`Decoded table snapshot for installed build ${buildId} not found.`);}
	return { buildId, extraction, manifest, snapshot };
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, `utf8`));
}

function fields(filePath) {
	return readJson(filePath).fields || {};
}

function normalizeText(value) {
	return String(value || ``)
		.replace(/\r?\n/g, ` `)
		.replace(/[’‘]/g, `'`)
		.replace(/[“”|]/g, `"`)
		.replace(/\s+/g, ` `)
		.trim();
}

function normalizeName(value) {
	return normalizeText(value).toLowerCase();
}

function normalizeElement(value) {
	return String(value || ``).split(`,`).map(part => part.trim()).filter(Boolean)
		.sort((first, second) => ELEMENT_ORDER.indexOf(first) - ELEMENT_ORDER.indexOf(second)).join(`, `);
}

function expectedNumber(row) {
	return `${String(row.zukanIndex).padStart(3, `0`)}${String(row.zukanIndexSuffix || ``).toUpperCase()}`;
}

function expectedElement(row) {
	const elements = [row.elementType1, row.elementType2]
		.filter(value => value && value !== `None`)
		.map(value => ELEMENT_NAMES[value] || value)
		.sort((first, second) => ELEMENT_ORDER.indexOf(first) - ELEMENT_ORDER.indexOf(second));
	return elements.join(`, `) || `None`;
}

function expectedSuitability(row, supportedWorkFields, localSuitability) {
	return WORK_FIELDS.map(([field, label]) => {
		if (supportedWorkFields.has(field)) {return Number(row[field]) > 0 ? `${label} ${row[field]}` : null;}
		return String(localSuitability || ``).split(`,`).map(value => value.trim())
			.find(value => value === label || value.startsWith(`${label} `)) || null;
	})
		.filter(Boolean)
		.join(`, `);
}

function localizedDescription(value, names) {
	return normalizeText(String(value || ``)
		.replace(/<characterName id=\|([^|]+)\|\/>/g, (match, id) => names[`PAL_NAME_${id}`] || id));
}

function localDescriptionBody(value) {
	const text = normalizeText(value);
	const separator = text.indexOf(` - `);
	return separator >= 0 ? text.slice(separator + 3) : text;
}

function addMismatch(mismatches, pal, field, local, game) {
	const normalize = field === `element` ? normalizeElement : normalizeText;
	const localValue = field === `suitability` && local === `None` ? `` : local;
	if (normalize(localValue) === normalize(game)) {return;}
	mismatches.push({ field, game, local, name: pal.name, number: pal.number });
}

function audit(config) {
	const extractionMetadata = readJson(path.join(config.extraction, `steam.json`));
	const snapshot = readJson(config.snapshot);
	if (String(extractionMetadata.buildId) !== config.buildId || String(snapshot.buildId) !== config.buildId) {
		throw new Error(`Extraction and table snapshot must both match installed build ${config.buildId}.`);
	}
	const localeDirectory = path.join(config.extraction, `L10N`, `en`);
	const names = fields(path.join(localeDirectory, `DT_PalNameText_Common.json`));
	const longDescriptions = fields(path.join(localeDirectory, `DT_PalLongDescriptionText.json`));
	const skillNames = fields(path.join(localeDirectory, `DT_SkillNameText_Common.json`));
	const palIndex = readJson(path.join(config.extraction, `Pals`, `pals.json`));
	const decodedTables = snapshot.tables?._decodedTables || {};
	const parameterTable = Object.entries(decodedTables)
		.find(([name]) => name.endsWith(`/DT_PalMonsterParameter`))?.[1];
	if (!Object.keys(parameterTable || {}).length) {
		throw new Error(`DT_PalMonsterParameter is missing or empty in ${config.snapshot}.`);
	}
	const indexedCodes = new Map(Object.keys(palIndex).map(code => [code.toLowerCase(), code]));
	const codesByName = new Map();
	for (const [key, value] of Object.entries(names)) {
		if (!key.startsWith(`PAL_NAME_`) || !normalizeText(value) || /^(en[_ ]?text|none)$/i.test(value)) {continue;}
		const localizedCode = key.slice(`PAL_NAME_`.length);
		const code = indexedCodes.get(localizedCode.toLowerCase());
		if (palIndex[code]?.main) {codesByName.set(normalizeName(value), code);}
	}

	const mismatches = [];
	const textDifferences = [];
	const missingGameRows = [];
	const matchedCodes = new Set();
	const visiblePals = palFile.Pals.filter(pal => !pal.hidden);
	const decodedRows = Object.values(palIndex).filter(entry => entry.main)
		.map(entry => {
			const row = readJson(path.join(config.extraction, `Pals`, entry.main));
			return { ...row, produceMedicine: parameterTable[row.name]?.WorkSuitability_ProductMedicine };
		});
	// A field that is zero across the entire extraction is probably unavailable under the current decoded schema.
	const supportedWorkFields = new Set(WORK_FIELDS.map(([field]) => field)
		.filter(field => decodedRows.some(row => Number(row[field]) > 0)));
	for (const pal of visiblePals) {
		const code = codesByName.get(normalizeName(pal.name));
		if (!code) {
			missingGameRows.push({ name: pal.name, number: pal.number });
			continue;
		}
		matchedCodes.add(code);
		const row = readJson(path.join(config.extraction, `Pals`, palIndex[code].main));
		row.produceMedicine = parameterTable[row.name]?.WorkSuitability_ProductMedicine;
		if (row.zukanIndex >= 0) {addMismatch(mismatches, pal, `number`, pal.number, expectedNumber(row));}
		addMismatch(mismatches, pal, `element`, pal.element, expectedElement(row));
		addMismatch(
			mismatches, pal, `suitability`, pal.suitability,
			expectedSuitability(row, supportedWorkFields, pal.suitability),
		);
		if (Number.isFinite(pal.rarity) && pal.rarity !== row.rarity) {
			mismatches.push({ field: `rarity`, game: row.rarity, local: pal.rarity, name: pal.name, number: pal.number });
		}
		const partnerTitle = skillNames[`PARTNERSKILL_${code}`];
		if (partnerTitle && partnerTitle !== `-`) {
			addMismatch(mismatches, pal, `partnerTitle`, String(pal.partner || ``).split(` - `)[0], partnerTitle);
		}
		const gameDescription = longDescriptions[`PAL_LONG_DESC_${code}`];
		if (gameDescription) {
			const local = localDescriptionBody(pal.description);
			const game = localizedDescription(gameDescription, names);
			if (normalizeText(local) !== normalizeText(game)) {
				textDifferences.push({ field: `description`, game, local, name: pal.name, number: pal.number });
			}
		}
	}

	const gameOnlyRows = [...codesByName.entries()]
		.filter(([, code]) => !matchedCodes.has(code))
		.map(([name, code]) => ({ code, name: names[`PAL_NAME_${code}`] || name }))
		.sort((first, second) => first.name.localeCompare(second.name));
	return {
		buildId: config.buildId,
		extraction: config.extraction,
		snapshot: config.snapshot,
		gameOnlyRows,
		mismatches,
		missingGameRows,
		textDifferences,
		unsupportedWorkFields: WORK_FIELDS.map(([field]) => field).filter(field => !supportedWorkFields.has(field)),
		summary: {
			gameOnlyRows: gameOnlyRows.length,
			matchedPals: visiblePals.length - missingGameRows.length,
			mismatches: mismatches.length,
			missingGameRows: missingGameRows.length,
			textDifferences: textDifferences.length,
			visiblePals: visiblePals.length,
		},
	};
}

function printReport(report) {
	const limit = Number(optionValue(`--limit`) ?? 50);
	console.log(`Installed-game Pal audit for Palworld build ${report.buildId}`);
	console.log(`Extraction: ${report.extraction}`);
	console.log(`Decoded tables: ${report.snapshot}`);
	console.log(`Visible/matched Pals: ${report.summary.visiblePals}/${report.summary.matchedPals}`);
	console.log(`Field mismatches: ${report.summary.mismatches}`);
	console.log(`Local Pals missing decoded rows: ${report.summary.missingGameRows}`);
	console.log(`Decoded named rows absent locally: ${report.summary.gameOnlyRows}`);
	console.log(`Editorial/localized description differences: ${report.summary.textDifferences}`);
	console.log(`Unavailable work fields: ${report.unsupportedWorkFields.join(`, `) || `none`}`);
	for (const mismatch of report.mismatches.slice(0, limit)) {
		console.log(`- ${mismatch.number} ${mismatch.name} ${mismatch.field}: ${JSON.stringify(mismatch.local)} -> ${JSON.stringify(mismatch.game)}`);
	}
	if (report.mismatches.length > limit) {console.log(`... ${report.mismatches.length - limit} more mismatches`);}
}

try {
	const report = audit(configuration());
	if (process.argv.includes(`--json`)) {console.log(JSON.stringify(report, null, 2));} else {printReport(report);}
	if (process.argv.includes(`--fail-on-drift`) && (report.mismatches.length || report.missingGameRows.length)) {
		process.exitCode = 1;
	}
} catch (error) {
	console.error(error.message || error);
	process.exitCode = 1;
}
