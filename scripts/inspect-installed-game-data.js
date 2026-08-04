#!/usr/bin/env node

// Lists and searches broadly decoded installed-game DataTables without mutating the cached snapshot.
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);

function optionValue(name) {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : null;
}

function snapshotPath() {
	const supplied = optionValue(`--snapshot`);
	if (supplied) {
		return path.resolve(supplied);
	}
	const directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `snapshots`);
	const files = fs.readdirSync(directory).filter(name => /^items-.+\.json$/u.test(name))
		.map(name => path.join(directory, name)).sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
	if (!files.length) {
		throw new Error(`No installed-game snapshot found; run npm run audit:installed-game-data:refresh.`);
	}
	return files[0];
}

function matches(value, pattern) {
	return pattern.test(JSON.stringify(value));
}

function searchTables(tables, search) {
	const escaped = search.replace(/[.*+?^${}()|[\]\\]/gu, `\\$&`);
	const pattern = new RegExp(escaped, `iu`);
	return tables.flatMap(([table, rows]) => Object.entries(rows).flatMap(([row, value]) =>
		matches({ row, value }, pattern) ? [{ table, row, value }] : [],
	));
}

try {
	const target = snapshotPath();
	const snapshot = JSON.parse(fs.readFileSync(target, `utf8`));
	const tables = snapshot.tables?._decodedTables || {};
	const tablePattern = optionValue(`--table`);
	const search = optionValue(`--search`);
	const limit = Number(optionValue(`--limit`) ?? 50);
	const selected = Object.entries(tables).filter(([name]) => !tablePattern || name.toLowerCase().includes(tablePattern.toLowerCase()));
	const results = search ?
		searchTables(selected, search) :
		selected.map(([table, rows]) => ({ table, rows: Object.keys(rows).length }));
	const output = { snapshot: target, buildId: snapshot.buildId, matches: results.length, results: results.slice(0, limit) };
	if (process.argv.includes(`--json`)) {
		console.log(JSON.stringify(output, null, 2));
	} else {
		console.log(`Installed-game snapshot ${snapshot.buildId}: ${target}`);
		console.log(`${search ? `Matching rows` : `Tables`}: ${results.length}`);
		for (const result of output.results) {
			console.log(search ? `- ${result.table} :: ${result.row}\n  ${JSON.stringify(result.value)}` : `- ${result.table} (${result.rows} rows)`);
		}
		if (results.length > limit) {
			console.log(`... ${results.length - limit} more`);
		}
	}
} catch (error) {
	console.error(error.message || error);
	process.exitCode = 1;
}
