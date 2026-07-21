const localBreedingFile = require(`../data/palBreeding.json`);
const localPalFile = require(`../data/palData.json`);
const {
	PALDB_IV_URL,
	PALDB_PALS_URL,
	compareData,
	fetchPaldbData,
	visiblePals,
} = require(`./lib/paldb-data.js`);

function parseArgs(argv) {
	const options = {
		failOnDrift: false,
		ignoreBlankCurrent: false,
		json: false,
		limit: 25,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === `--fail-on-drift`) {
			options.failOnDrift = true;
			continue;
		}

		if (arg === `--ignore-blank-current`) {
			options.ignoreBlankCurrent = true;
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

function formatChange(change) {
	return `${change.field}: ${change.local || `(blank)`} -> ${change.current || `(blank)`}`;
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

function printHumanReport(report, limit) {
	console.log(`Palworld data audit against PalDB`);
	console.log(`Local visible palData rows: ${report.summary.localPalData}`);
	console.log(`Local hidden placeholder rows: ${report.summary.localHiddenPlaceholders}`);
	console.log(`Local Pal breeding metadata rows: ${report.summary.localBreedingMetadata}`);
	console.log(`Local breeding unique combinations: ${report.summary.localBreedingUniqueCombinations}`);
	console.log(`Local breeding source overrides: ${report.summary.localBreedingSourceOverrides}`);
	console.log(`PalDB card rows: ${report.summary.paldbCardRows}`);
	console.log(`PalDB JSON rows: ${report.summary.paldbJsonRows}`);
	console.log(`Current merged rows: ${report.summary.currentRows}`);

	printRows(`Added in PalDB`, report.diff.added, limit, row => `#${row.number} ${row.name}`);
	printRows(`Missing from PalDB`, report.diff.removed, limit, row => `#${row.number} ${row.name}`);
	printRows(
		`Changed palData fields`,
		report.diff.changedPals,
		limit,
		row => `${row.name}: ${row.changes.map(formatChange).join(`; `)}`,
	);
	printRows(
		`Changed breeding identifiers/numbers`,
		report.diff.changedBreeding,
		limit,
		row => `${row.name}: ${row.changes.map(formatChange).join(`; `)}`,
	);
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const { currentRows, ivRows, paldbCardRows } = await fetchPaldbData();
	const localVisiblePals = visiblePals(localPalFile);
	const hiddenPlaceholderRows = localPalFile.Pals.filter(pal => pal.hidden && pal.placeholder);
	const diff = compareData(currentRows, localPalFile, localBreedingFile, {
		ignoreBlankCurrent: options.ignoreBlankCurrent,
	});
	const report = {
		diff,
		sources: {
			iv: PALDB_IV_URL,
			pals: PALDB_PALS_URL,
		},
		summary: {
			currentRows: currentRows.length,
			localBreedingMetadata: localPalFile.Pals.filter(pal => pal.breeding).length,
			localBreedingSourceOverrides: (localBreedingFile.SourceOverrides || []).length,
			localBreedingUniqueCombinations: localBreedingFile.UniqueCombinations.length,
			localHiddenPlaceholders: hiddenPlaceholderRows.length,
			localPalData: localVisiblePals.length,
			localPalDataRows: localPalFile.Pals.length,
			paldbCardRows: paldbCardRows.length,
			paldbJsonRows: ivRows.length,
		},
	};
	const driftCount = diff.added.length + diff.removed.length + diff.changedPals.length + diff.changedBreeding.length;

	if (options.json) {
		console.log(JSON.stringify(report, null, 2));
	} else {
		printHumanReport(report, options.limit);
	}

	if (options.failOnDrift && driftCount > 0) {
		process.exit(1);
	}
}

main().catch(error => {
	console.error(error.message);
	process.exit(1);
});
