const { SchemaMigrations, sequelize } = require(`./dbObjects.js`);
const { info, warn } = require(`../utils/writeLog.js`);
const path = require(`node:path`);
const fs = require(`node:fs`);

function getQueryRows(queryResult) {
	const [rows] = queryResult;

	if (!rows) {
		return [];
	}

	return Array.isArray(rows) ? rows : [rows];
}

function quoteIdentifier(value) {
	return `"${String(value).replace(/"/g, `""`)}"`;
}

function sqlString(value) {
	return `'${String(value).replace(/'/g, `''`)}'`;
}

function getTimestamp() {
	return new Date()
		.toISOString()
		.replace(/\D/g, ``)
		.slice(0, 14);
}

function getBackupLabel(value) {
	return value
		.replace(/[^a-z0-9_-]/gi, `-`)
		.replace(/-+/g, `-`)
		.slice(0, 80);
}

async function tableExists(tableName) {
	const rows = getQueryRows(await sequelize.query(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
		{ replacements: [tableName] },
	));

	return rows.length > 0;
}

async function getTableColumns(tableName) {
	const rows = getQueryRows(await sequelize.query(`PRAGMA table_info(${quoteIdentifier(tableName)})`));

	return new Map(rows.map(column => [column.name, column]));
}

async function getTableIndexes(tableName) {
	return getQueryRows(await sequelize.query(`PRAGMA index_list(${quoteIdentifier(tableName)})`));
}

async function backupDatabase(reason) {
	const dbPath = path.join(__dirname, `database.sqlite`);

	if (!fs.existsSync(dbPath)) {
		return null;
	}

	await sequelize.query(`PRAGMA wal_checkpoint(FULL)`).catch(() => null);

	const backupPath = path.join(
		__dirname,
		`database.sqlite.pre-${getBackupLabel(reason)}-${getTimestamp()}`,
	);

	await fs.promises.copyFile(dbPath, backupPath);
	info(`Created database backup ${backupPath}`);

	return backupPath;
}

async function warnForeignKeyViolations(context) {
	const violations = getQueryRows(await sequelize.query(`PRAGMA foreign_key_check`));

	if (violations.length) {
		warn(`${context} found ${violations.length} foreign key violation(s).`);
	}
}

function textWithFallback(columns, columnName, fallback) {
	if (!columns.has(columnName)) {
		return sqlString(fallback);
	}

	return `COALESCE(NULLIF(TRIM(${quoteIdentifier(columnName)}), ''), ${sqlString(fallback)})`;
}

function acceptedExpression(columns) {
	if (!columns.has(`accepted`)) {
		return `0`;
	}

	return `
		CASE
			WHEN ${quoteIdentifier(`accepted`)} IS NULL THEN 0
			WHEN LOWER(CAST(${quoteIdentifier(`accepted`)} AS TEXT)) IN ('1', 'true', 'yes') THEN 1
			ELSE 0
		END
	`;
}

function suggestionsNeedsRebuild(columns) {
	const suggestion = columns.get(`suggestion`);
	const author = columns.get(`author`);
	const accepted = columns.get(`accepted`);
	const requiredColumns = [`id`, `suggestion`, `author`, `suggestion_id`, `accepted`];

	if (requiredColumns.some(columnName => !columns.has(columnName))) {
		return true;
	}

	return !String(suggestion.type || ``).toUpperCase().includes(`TEXT`) ||
		!suggestion.notnull ||
		!author.notnull ||
		!accepted.notnull ||
		accepted.dflt_value === null;
}

async function rebuildSuggestionsTable(columns) {
	const idExpression = columns.has(`id`) ? quoteIdentifier(`id`) : `rowid`;
	const suggestionIdExpression = columns.has(`suggestion_id`) ?
		quoteIdentifier(`suggestion_id`) :
		`NULL`;

	await backupDatabase(`suggestions-schema`);
	info(`Rebuilding Suggestions table to repair text storage and required fields`);
	await sequelize.query(`PRAGMA foreign_keys = OFF`);

	try {
		await sequelize.transaction(async transaction => {
			await sequelize.query(`DROP TABLE IF EXISTS Suggestions_rebuild`, { transaction });
			await sequelize.query(`
				CREATE TABLE Suggestions_rebuild (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					suggestion TEXT NOT NULL,
					author VARCHAR(255) NOT NULL,
					suggestion_id VARCHAR(255),
					accepted TINYINT(1) NOT NULL DEFAULT 0
				)
			`, { transaction });
			await sequelize.query(`
				INSERT INTO Suggestions_rebuild (
					id,
					suggestion,
					author,
					suggestion_id,
					accepted
				)
				SELECT
					${idExpression},
					${textWithFallback(columns, `suggestion`, `[legacy missing suggestion]`)},
					${textWithFallback(columns, `author`, `Unknown legacy author`)},
					${suggestionIdExpression},
					${acceptedExpression(columns)}
				FROM Suggestions
			`, { transaction });
			await sequelize.query(`DROP TABLE Suggestions`, { transaction });
			await sequelize.query(`ALTER TABLE Suggestions_rebuild RENAME TO Suggestions`, { transaction });
			await sequelize.query(`
				UPDATE sqlite_sequence
				SET seq = COALESCE((SELECT MAX(id) FROM Suggestions), 0)
				WHERE name = 'Suggestions'
			`, { transaction });
			await sequelize.query(`
				INSERT OR IGNORE INTO sqlite_sequence (name, seq)
				SELECT 'Suggestions', COALESCE((SELECT MAX(id) FROM Suggestions), 0)
			`, { transaction });
		});
	} finally {
		await sequelize.query(`PRAGMA foreign_keys = ON`);
	}
}

async function migrateSuggestionsSchema() {
	if (!await tableExists(`Suggestions`)) {
		return;
	}

	const columns = await getTableColumns(`Suggestions`);

	if (!suggestionsNeedsRebuild(columns)) {
		return;
	}

	await rebuildSuggestionsTable(columns);
}

async function addColumnIfMissing(tableName, columns, columnName, definition) {
	if (columns.has(columnName)) {
		return false;
	}

	await sequelize.query(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`);
	columns.set(columnName, { name: columnName });
	return true;
}

async function migrateSuggestionReplyContext() {
	if (!await tableExists(`Suggestions`)) {
		return;
	}

	const columns = await getTableColumns(`Suggestions`);
	const addedColumns = [];
	const columnDefinitions = [
		[`author_id`, `VARCHAR(255)`],
		[`guild_id`, `VARCHAR(255)`],
		[`guild_name`, `VARCHAR(255)`],
		[`channel_id`, `VARCHAR(255)`],
		[`channel_name`, `VARCHAR(255)`],
	];

	for (const [columnName, definition] of columnDefinitions) {
		if (await addColumnIfMissing(`Suggestions`, columns, columnName, definition)) {
			addedColumns.push(columnName);
		}
	}

	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS SuggestionsSuggestionId
		ON Suggestions (suggestion_id)
	`);
	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS SuggestionsAuthorId
		ON Suggestions (author_id)
	`);

	if (addedColumns.length) {
		info(`Added suggestion reply context column(s): ${addedColumns.join(`, `)}`);
	}
}

async function migrateSearchSessionIndexes() {
	if (!await tableExists(`SearchSessions`)) {
		return;
	}

	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS SearchSessionsExpiresAt
		ON SearchSessions (expires_at)
	`);
	await sequelize.query(`
		CREATE INDEX IF NOT EXISTS SearchSessionsUserId
		ON SearchSessions (user_id)
	`);
	info(`Ensured SearchSessions indexes exist`);
}

async function removeDuplicateSearchSessionIndexes() {
	if (!await tableExists(`SearchSessions`)) {
		return;
	}

	const duplicateIndexNames = [
		`search_sessions_expires_at`,
		`search_sessions_user_id`,
	];
	const indexes = await getTableIndexes(`SearchSessions`);
	const duplicates = duplicateIndexNames.filter(indexName =>
		indexes.some(index => index.name === indexName),
	);

	for (const indexName of duplicates) {
		await sequelize.query(`DROP INDEX IF EXISTS ${quoteIdentifier(indexName)}`);
	}

	if (duplicates.length) {
		info(`Removed duplicate SearchSessions index(es): ${duplicates.join(`, `)}`);
	}
}

async function migratePaldeckUpdateAnnouncements() {
	if (!await tableExists(`JoinedServers`)) {
		return;
	}

	const columns = await getTableColumns(`JoinedServers`);
	const addedColumns = [];
	const columnDefinitions = [
		[`paldeck_announcement_channel_id`, `VARCHAR(255)`],
		[`paldeck_announcement_last_id`, `VARCHAR(255)`],
	];

	for (const [columnName, definition] of columnDefinitions) {
		if (await addColumnIfMissing(`JoinedServers`, columns, columnName, definition)) {
			addedColumns.push(columnName);
		}
	}

	if (addedColumns.length) {
		info(`Added Paldeck update announcement column(s): ${addedColumns.join(`, `)}`);
	}
}

const migrations = [
	{
		description: `Repair suggestion storage for longer text and required fields.`,
		id: `20260618_suggestions_text_and_required_fields`,
		run: migrateSuggestionsSchema,
	},
	{
		description: `Store context needed to reply to suggestions.`,
		id: `20260701_suggestion_reply_context`,
		run: migrateSuggestionReplyContext,
	},
	{
		description: `Add indexes for temporary Paldeck search sessions.`,
		id: `20260618_search_session_indexes`,
		run: migrateSearchSessionIndexes,
	},
	{
		description: `Remove duplicate search-session indexes created by model sync.`,
		id: `20260618_remove_duplicate_search_session_indexes`,
		run: removeDuplicateSearchSessionIndexes,
	},
	{
		description: `Store Paldeck update announcement settings for joined servers.`,
		id: `20260713_paldeck_update_announcements`,
		run: migratePaldeckUpdateAnnouncements,
	},
];

async function runTrackedMigration(migration) {
	const existingMigration = await SchemaMigrations.findByPk(migration.id);

	if (existingMigration) {
		return;
	}

	await migration.run();
	await SchemaMigrations.create({
		appliedAt: new Date(),
		description: migration.description,
		id: migration.id,
	});
	info(`Recorded database migration ${migration.id}`);
}

async function runMigrations() {
	await SchemaMigrations.sync();

	for (const migration of migrations) {
		await runTrackedMigration(migration);
	}

	await warnForeignKeyViolations(`Database migration`);
}

module.exports = {
	runMigrations,
};
