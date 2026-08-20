// Synchronizes species level-up moves from the decoded installed-game snapshot.
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);

const ROOT_DIR = path.resolve(__dirname, `..`, `..`);
const PAL_DATA_PATH = path.join(ROOT_DIR, `data`, `palData.json`);
const MOVE_TABLE_PATH = `Pal/Content/Pal/DataTable/Waza/DT_WazaMasterLevel`;
const MOVE_NAME_TABLE_PATH = `Pal/Content/L10N/en/Pal/DataTable/Text/DT_SkillNameText_Common`;

// Astralym is represented only by its second World Tree tower-boss definition.
const PAL_ID_OVERRIDES = new Map([
	[`Astralym`, `GYM_WorldTreeDragon_2`],
]);

// These boss actions are present in the move table but have no English localization rows.
const MOVE_NAME_OVERRIDES = new Map([
	[`unique_worldtreedragon_paldiumshot`, `Paldium Shot`],
	[`unique_worldtreedragon_paldiumcannon`, `Paldium Cannon`],
	[`unique_worldtreedragon_paldiumrain`, `Paldium Rain`],
	[`unique_worldtreedragon_paldiumexplosion`, `Paldium Explosion`],
]);

function optionValue(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? null : process.argv[index + 1];
}

function installedSnapshotPath() {
	const supplied = optionValue(`--snapshot`);
	if (supplied) {
		return path.resolve(supplied);
	}

	const directory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), `Paldeck`, `game-audit`, `snapshots`);
	const candidates = fs.readdirSync(directory)
		.filter(name => /^items-\d+\.json$/u.test(name))
		.map(name => path.join(directory, name))
		.sort((first, second) => fs.statSync(second).mtimeMs - fs.statSync(first).mtimeMs);

	if (!candidates.length) {
		throw new Error(`No decoded installed-game snapshot was found.`);
	}
	return candidates[0];
}

function internalMoveId(value) {
	return String(value || ``).replace(/^EPalWazaID::/u, ``);
}

function localizedMoveNames(table) {
	return new Map(Object.entries(table || {})
		.filter(([key]) => key.startsWith(`ACTION_SKILL_`))
		.map(([key, row]) => [key.slice(`ACTION_SKILL_`.length).toLowerCase(), row.TextData?.LocalizedString || row.TextData?.SourceString || ``]));
}

function rowsByPalId(table) {
	const result = new Map();
	for (const row of Object.values(table || {})) {
		const key = String(row.PalId || ``).toLowerCase();
		if (!result.has(key)) {
			result.set(key, []);
		}
		result.get(key).push(row);
	}
	return result;
}

function movesForPal(pal, rowsById, names) {
	const gameId = PAL_ID_OVERRIDES.get(pal.name) || pal.breeding?.id;
	const rows = rowsById.get(String(gameId || ``).toLowerCase()) || [];
	return rows
		.map(row => {
			const id = internalMoveId(row.WazaID);
			const normalizedId = id.toLowerCase();
			return { level: row.Level, name: names.get(normalizedId) || MOVE_NAME_OVERRIDES.get(normalizedId), id };
		})
		.sort((first, second) => first.level - second.level || first.name.localeCompare(second.name));
}

function main() {
	const write = process.argv.includes(`--write`);
	const snapshotPath = installedSnapshotPath();
	const snapshot = JSON.parse(fs.readFileSync(snapshotPath, `utf8`));
	const tables = snapshot.tables?._decodedTables || {};
	const moveRows = rowsByPalId(tables[MOVE_TABLE_PATH]);
	const moveNames = localizedMoveNames(tables[MOVE_NAME_TABLE_PATH]);
	const palData = JSON.parse(fs.readFileSync(PAL_DATA_PATH, `utf8`));
	const problems = [];

	for (const pal of palData.Pals) {
		if (pal.hidden) {
			continue;
		}
		const moves = movesForPal(pal, moveRows, moveNames);
		if (!moves.length) {
			problems.push(`${pal.name}: no level-up move rows found.`);
			continue;
		}
		for (const move of moves) {
			if (!move.name) {
				problems.push(`${pal.name}: no English name for ${move.id}.`);
			}
		}
		pal.levelUpMoves = moves;
	}

	if (problems.length) {
		throw new Error(problems.join(`\n`));
	}
	if (write) {
		fs.writeFileSync(PAL_DATA_PATH, `${JSON.stringify(palData, null, `\t`)}\n`);
	}
	console.log(`${write ? `Updated` : `Validated`} level-up moves for ${palData.Pals.filter(pal => !pal.hidden).length} Pals from build ${snapshot.buildId}.`);
}

main();
