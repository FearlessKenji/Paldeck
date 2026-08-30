// SQLCipher database encryption, conversion, and rekey helpers.
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const { Buffer } = require(`node:buffer`);
const {
	isDatabaseProtectionEnabled,
	isEncryptedDatabaseRuntimeEnabled,
	parseDotEnvContent,
	readDatabaseKeyFromEnv,
	readDatabaseKeyFromEnvFile,
	resolveKeyFilePath,
} = require(`./dbEncryptionConfig.js`);

// Shared database protection helpers. Paldeck runtime, HachiGen, smoke tests, and
// database tooling all use this file so encryption behavior stays consistent.
// The module intentionally separates three concepts:
// - file status: what the bytes on disk look like
// - key status: where the configured key comes from
// - access status: whether SQLCipher can actually open the file with that key
const CIPHER_DRIVER_PACKAGE = `better-sqlite3-multiple-ciphers`;

// Plain SQLite files start with this exact header. SQLCipher databases do not,
// so this cheap check lets HachiGen identify plaintext databases before opening
// them and lets configCheck fail fast when plaintext is still present.
const SQLITE_HEADER = Buffer.from([
	0x53,
	0x51,
	0x4c,
	0x69,
	0x74,
	0x65,
	0x20,
	0x66,
	0x6f,
	0x72,
	0x6d,
	0x61,
	0x74,
	0x20,
	0x33,
	0x00,
]);

// Header inspection cannot prove the database opens, but it is fast and safe:
// plaintext is detected, encrypted-looking files are flagged for key verification.
function databaseFileStatus(dbPath = path.resolve(`database`, `database.sqlite`)) {
	if (!fs.existsSync(dbPath)) {
		return {
			detail: `No database file found.`,
			dot: `muted`,
			encryptedLikely: false,
			label: `Missing`,
			path: dbPath,
			status: `missing`,
		};
	}

	const stats = fs.statSync(dbPath);

	if (!stats.isFile()) {
		return {
			detail: `Database path exists but is not a file.`,
			dot: `bad`,
			encryptedLikely: false,
			label: `Invalid Path`,
			path: dbPath,
			status: `invalid`,
		};
	}

	if (stats.size < SQLITE_HEADER.length) {
		return {
			detail: `Database file is too small to be a valid encrypted database.`,
			dot: `bad`,
			encryptedLikely: false,
			label: `Invalid Format`,
			path: dbPath,
			size: stats.size,
			status: `invalid`,
		};
	}

	const handle = fs.openSync(dbPath, `r`);
	const header = Buffer.alloc(SQLITE_HEADER.length);

	try {
		fs.readSync(handle, header, 0, SQLITE_HEADER.length, 0);
	} finally {
		fs.closeSync(handle);
	}

	if (header.equals(SQLITE_HEADER)) {
		return {
			detail: `Database is still plain SQLite.`,
			dot: `info`,
			encryptedLikely: false,
			label: `Plain SQLite`,
			path: dbPath,
			size: stats.size,
			status: `plaintext`,
		};
	}

	return {
		detail: `Database file is encrypted. Open it with the configured key to verify access.`,
		dot: `info`,
		encryptedLikely: true,
		label: `Encrypted`,
		path: dbPath,
		size: stats.size,
		status: `encrypted`,
	};
}

function verifiedEncryptedDatabaseStatus(dbPath) {
	return {
		...databaseFileStatus(dbPath),
		detail: `Database opens with the configured key.`,
		dot: `good`,
		encryptedLikely: true,
		label: `Encrypted`,
		status: `encrypted`,
	};
}

// Access status is stronger than file status because it proves the configured
// key can open the encrypted file and read basic schema metadata.
function databaseAccessStatus({
	dbPath = path.resolve(`database`, `database.sqlite`),
	key = ``,
	root = process.cwd(),
} = {}) {
	const status = databaseFileStatus(dbPath);

	if (!status.encryptedLikely) {
		return status;
	}

	if (!String(key || ``).trim()) {
		return {
			...status,
			detail: `Database is encrypted. Configure the database key to verify access.`,
			dot: `warn`,
			label: `Encrypted`,
			status: `encrypted`,
		};
	}

	try {
		verifyEncryptedDatabaseFile({
			dbPath,
			key,
			root,
		});

		return verifiedEncryptedDatabaseStatus(dbPath);
	} catch (error) {
		return {
			...status,
			detail: `Database could not be opened with the configured key: ${error.message || String(error)}`,
			dot: `bad`,
			encryptedLikely: false,
			label: `Invalid Format`,
			status: `invalid`,
		};
	}
}

function findPackageJson(modulePath, packageName) {
	let currentDir = path.dirname(modulePath);

	while (currentDir && currentDir !== path.dirname(currentDir)) {
		const packagePath = path.join(currentDir, `package.json`);

		if (fs.existsSync(packagePath)) {
			try {
				const packageJson = JSON.parse(fs.readFileSync(packagePath, `utf8`));

				if (packageJson.name === packageName) {
					return packagePath;
				}
			} catch {
				return ``;
			}
		}

		currentDir = path.dirname(currentDir);
	}

	return ``;
}

function loadCipherDriver(root = process.cwd()) {
	const modulePath = require.resolve(CIPHER_DRIVER_PACKAGE, { paths: [root] });
	return require(modulePath);
}

// Keep SQL quoting local to PRAGMA application. Database keys are strings, not
// identifiers, so quoteSqlString escapes single quotes for SQLCipher PRAGMA key.
function quoteSqlString(value) {
	return `'${String(value || ``).replace(/'/gu, `''`)}'`;
}

function quoteSqlIdentifier(value) {
	return `"${String(value || ``).replace(/"/gu, `""`)}"`;
}

function applySqlCipherPragmas(db, key) {
	db.pragma(`cipher='sqlcipher'`);
	db.pragma(`legacy=4`);
	db.pragma(`key=${quoteSqlString(key)}`);
}

// Central open helper for every direct SQLCipher connection. Callers should use
// this instead of constructing better-sqlite3-multiple-ciphers handles directly.
function openSqlCipherDatabase({
	dbPath,
	fileMustExist = true,
	key,
	readonly = false,
	root = process.cwd(),
} = {}) {
	const normalizedKey = String(key || ``).trim();

	if (!normalizedKey) {
		throw new Error(`No database encryption key is configured.`);
	}

	if (!dbPath) {
		throw new Error(`No database path was provided.`);
	}

	const Database = loadCipherDriver(root);
	const db = new Database(dbPath, {
		fileMustExist: Boolean(fileMustExist),
		readonly: Boolean(readonly),
	});
	applySqlCipherPragmas(db, normalizedKey);

	return db;
}

// Schema-copy helpers below use SQLite metadata rather than model definitions.
// That preserves the current live database shape during encryption conversion,
// including tables that may have compatible drift from older versions.
function getSqliteTables(db) {
	return db.prepare(`
		SELECT name, sql
		FROM sqlite_master
		WHERE type = 'table'
			AND name NOT LIKE 'sqlite_%'
			AND sql IS NOT NULL
		ORDER BY name
	`).all();
}

function getSqliteObjects(db) {
	return db.prepare(`
		SELECT name, sql, type
		FROM sqlite_master
		WHERE type IN ('index', 'trigger', 'view')
			AND sql IS NOT NULL
		ORDER BY
			CASE type
				WHEN 'index' THEN 1
				WHEN 'trigger' THEN 2
				WHEN 'view' THEN 3
				ELSE 4
			END,
			name
	`).all();
}

function sqliteTableExists(db, tableName) {
	const row = db.prepare(`
		SELECT name
		FROM sqlite_master
		WHERE type = 'table'
			AND name = ?
	`).get(tableName);
	return Boolean(row);
}

function copySqliteRows(sourceDb, targetDb, tableName) {
	const columns = sourceDb.prepare(`PRAGMA table_info(${quoteSqlIdentifier(tableName)})`).all()
		.map(column => column.name);

	if (!columns.length) {
		return 0;
	}

	const quotedColumns = columns.map(quoteSqlIdentifier).join(`, `);
	const placeholders = columns.map(() => `?`).join(`, `);
	const select = sourceDb.prepare(`SELECT ${quotedColumns} FROM ${quoteSqlIdentifier(tableName)}`);
	const insert = targetDb.prepare(`INSERT INTO ${quoteSqlIdentifier(tableName)} (${quotedColumns}) VALUES (${placeholders})`);
	let rowsCopied = 0;

	for (const row of select.iterate()) {
		insert.run(...columns.map(column => row[column]));
		rowsCopied += 1;
	}

	return rowsCopied;
}

function copySqliteSequence(sourceDb, targetDb) {
	if (!sqliteTableExists(sourceDb, `sqlite_sequence`) || !sqliteTableExists(targetDb, `sqlite_sequence`)) {
		return;
	}

	const sequenceRows = sourceDb.prepare(`SELECT name, seq FROM sqlite_sequence`).all();
	const insertSequence = targetDb.prepare(`INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)`);

	targetDb.exec(`DELETE FROM sqlite_sequence`);

	for (const row of sequenceRows) {
		insertSequence.run(row.name, row.seq);
	}
}

// Verification intentionally performs a tiny read instead of trusting that open()
// succeeded. Wrong SQLCipher keys can create confusing late failures otherwise.
function verifyEncryptedDatabaseFile({ dbPath, key, root = process.cwd() } = {}) {
	let db = null;

	try {
		db = openSqlCipherDatabase({
			dbPath,
			key,
			readonly: true,
			root,
		});
		const integrityRows = db.prepare(`PRAGMA integrity_check`).all();
		const integrityProblems = integrityRows
			.map(row => Object.values(row)[0])
			.filter(value => value && value !== `ok`);

		if (integrityProblems.length) {
			throw new Error(`Encrypted database integrity check failed: ${integrityProblems.join(`; `)}`);
		}

		db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' LIMIT 1`).get();

		return {
			ok: true,
			status: verifiedEncryptedDatabaseStatus(dbPath),
		};
	} finally {
		if (db) {
			db.close();
		}
	}
}

// Rekey is done in place by SQLCipher, then immediately verified by reopening
// with the new key. Callers create safety backups before invoking this.
function rekeyEncryptedDatabase({
	dbPath,
	newKey,
	oldKey,
	root = process.cwd(),
} = {}) {
	const normalizedOldKey = String(oldKey || ``).trim();
	const normalizedNewKey = String(newKey || ``).trim();

	if (!normalizedOldKey) {
		throw new Error(`No current database encryption key was provided.`);
	}

	if (!normalizedNewKey) {
		throw new Error(`No new database encryption key was provided.`);
	}

	if (normalizedOldKey === normalizedNewKey) {
		throw new Error(`New database key must differ from the current key.`);
	}

	let db = null;

	try {
		db = openSqlCipherDatabase({
			dbPath,
			key: normalizedOldKey,
			root,
		});
		db.pragma(`rekey=${quoteSqlString(normalizedNewKey)}`);
	} finally {
		if (db) {
			db.close();
		}
	}

	return verifyEncryptedDatabaseFile({
		dbPath,
		key: normalizedNewKey,
		root,
	});
}

function validateConversionRequest({ key, sourcePath, targetPath }) {
	const normalizedKey = String(key || ``).trim();

	if (!normalizedKey) {
		throw new Error(`No database encryption key is configured.`);
	}

	if (!targetPath) {
		throw new Error(`No encrypted database target path was provided.`);
	}

	const sourceStatus = databaseFileStatus(sourcePath);

	if (sourceStatus.status !== `plaintext`) {
		throw new Error(`Database conversion requires a plain SQLite source. Current status: ${sourceStatus.label}.`);
	}

	if (fs.existsSync(targetPath)) {
		throw new Error(`Encrypted database target already exists: ${targetPath}`);
	}

	return normalizedKey;
}

function copyPlainDatabaseContents(sourceDb, targetDb, result) {
	targetDb.exec(`PRAGMA foreign_keys = OFF`);
	targetDb.exec(`BEGIN IMMEDIATE TRANSACTION`);

	try {
		const tables = getSqliteTables(sourceDb);

		for (const table of tables) {
			targetDb.exec(table.sql);
			result.tablesCopied += 1;
		}

		for (const table of tables) {
			result.rowsCopied += copySqliteRows(sourceDb, targetDb, table.name);
		}

		copySqliteSequence(sourceDb, targetDb);

		for (const object of getSqliteObjects(sourceDb)) {
			targetDb.exec(object.sql);
			result.objectsCopied += 1;
		}

		const userVersion = Number.isFinite(result.userVersion) ? result.userVersion : 0;
		targetDb.pragma(`user_version = ${userVersion}`);
		targetDb.exec(`COMMIT`);
	} catch (error) {
		try {
			targetDb.exec(`ROLLBACK`);
		} catch {
			// Preserve the original conversion error.
		}

		throw error;
	}
}

// Conversion creates and verifies a separate encrypted target before its caller
// performs any file swap, leaving the plaintext source untouched on failure.
function convertPlainDatabaseToEncrypted({
	key,
	root = process.cwd(),
	sourcePath = path.resolve(`database`, `database.sqlite`),
	targetPath,
} = {}) {
	const normalizedKey = validateConversionRequest({ key, sourcePath, targetPath });

	const Database = loadCipherDriver(root);
	let sourceDb = null;
	let targetDb = null;
	const result = {
		objectsCopied: 0,
		rowsCopied: 0,
		tablesCopied: 0,
		userVersion: 0,
	};

	try {
		sourceDb = new Database(sourcePath, {
			fileMustExist: true,
			readonly: true,
		});
		targetDb = openSqlCipherDatabase({
			dbPath: targetPath,
			fileMustExist: false,
			key: normalizedKey,
			root,
		});
		result.userVersion = Number(sourceDb.pragma(`user_version`, { simple: true }) || 0);

		copyPlainDatabaseContents(sourceDb, targetDb, result);
	} finally {
		if (targetDb) {
			targetDb.close();
		}

		if (sourceDb) {
			sourceDb.close();
		}
	}

	const verification = verifyEncryptedDatabaseFile({
		dbPath: targetPath,
		key: normalizedKey,
		root,
	});

	return {
		...result,
		status: verification.status,
	};
}

function cleanupCipherTestFiles(testDir, dbPath) {
	for (const filePath of [
		dbPath,
		`${dbPath}-wal`,
		`${dbPath}-shm`,
		`${dbPath}-journal`,
	]) {
		try {
			if (fs.existsSync(filePath)) {
				fs.unlinkSync(filePath);
			}
		} catch {
			// Temporary test cleanup should not hide the verification result.
		}
	}

	try {
		fs.rmdirSync(testDir);
	} catch {
		// The OS temp folder can clean up leftovers if a handle is still open.
	}
}

// Driver status is used by HachiGen panels and configCheck messaging. It avoids
// loading the native module unless necessary, because native module mismatches
// are common during Node upgrades and should be reported clearly.
function cipherDriverStatus(root = process.cwd()) {
	try {
		const modulePath = require.resolve(CIPHER_DRIVER_PACKAGE, { paths: [root] });
		const packagePath = findPackageJson(modulePath, CIPHER_DRIVER_PACKAGE);
		const packageJson = packagePath ? JSON.parse(fs.readFileSync(packagePath, `utf8`)) : {};

		return {
			detail: `SQLCipher driver is installed and ready for encrypted database access.`,
			dot: `good`,
			installed: true,
			label: `Driver Installed`,
			modulePath,
			packageName: CIPHER_DRIVER_PACKAGE,
			status: `installed`,
			version: packageJson.version || ``,
		};
	} catch (err) {
		return {
			detail: `${CIPHER_DRIVER_PACKAGE} is not available in node_modules. Install Paldeck dependencies normally.`,
			dot: `warn`,
			error: err.code || err.message || String(err),
			installed: false,
			label: `Driver Missing`,
			packageName: CIPHER_DRIVER_PACKAGE,
			status: `missing`,
			version: ``,
		};
	}
}

function verifyCipherDriverCanOpen({ key, root = process.cwd(), tempDir = os.tmpdir() } = {}) {
	const normalizedKey = String(key || ``).trim();
	const driver = cipherDriverStatus(root);

	if (!normalizedKey) {
		return {
			detail: `No database key is configured.`,
			dot: `bad`,
			ok: false,
			label: `Cipher Test Failed`,
			status: `missing-key`,
		};
	}

	if (!driver.installed) {
		return {
			...driver,
			dot: `warn`,
			ok: false,
			label: `Cipher Test Skipped`,
			status: `driver-missing`,
		};
	}

	const testDir = fs.mkdtempSync(path.join(tempDir, `hachi-cipher-test-`));
	const testDbPath = path.join(testDir, `cipher-test.sqlite`);
	let db = null;

	try {
		const Database = loadCipherDriver(root);
		db = new Database(testDbPath);
		applySqlCipherPragmas(db, normalizedKey);
		db.exec(`
			CREATE TABLE cipher_test (
				id INTEGER PRIMARY KEY,
				value TEXT NOT NULL
			);
			INSERT INTO cipher_test (value) VALUES ('ok');
		`);
		db.close();
		db = null;

		const testFileStatus = databaseFileStatus(testDbPath);

		if (!testFileStatus.encryptedLikely) {
			return {
				detail: `Temporary test database still has a plain SQLite header.`,
				dot: `bad`,
				ok: false,
				label: `Cipher Test Failed`,
				status: `plaintext-test-db`,
			};
		}

		db = new Database(testDbPath, {
			fileMustExist: true,
			readonly: true,
		});
		applySqlCipherPragmas(db, normalizedKey);
		const row = db.prepare(`SELECT value FROM cipher_test WHERE id = 1`).get();

		if (row?.value !== `ok`) {
			return {
				detail: `Temporary encrypted database reopened, but the verification row was not readable.`,
				dot: `bad`,
				ok: false,
				label: `Cipher Test Failed`,
				status: `verification-row-mismatch`,
			};
		}

		return {
			detail: `Created and reopened a temporary SQLCipher-compatible database with the configured key.`,
			dot: `good`,
			driverVersion: driver.version,
			ok: true,
			label: `Cipher Test Passed`,
			status: `passed`,
		};
	} catch (err) {
		return {
			detail: err.message || String(err),
			dot: `bad`,
			ok: false,
			label: `Cipher Test Failed`,
			status: `failed`,
		};
	} finally {
		if (db) {
			try {
				db.close();
			} catch {
				// The original verification result is more useful than a close failure.
			}
		}

		cleanupCipherTestFiles(testDir, testDbPath);
	}
}

module.exports = {
	CIPHER_DRIVER_PACKAGE,
	cipherDriverStatus,
	convertPlainDatabaseToEncrypted,
	databaseAccessStatus,
	databaseFileStatus,
	isDatabaseProtectionEnabled,
	isEncryptedDatabaseRuntimeEnabled,
	parseDotEnvContent,
	readDatabaseKeyFromEnv,
	readDatabaseKeyFromEnvFile,
	openSqlCipherDatabase,
	rekeyEncryptedDatabase,
	resolveKeyFilePath,
	verifyEncryptedDatabaseFile,
	verifyCipherDriverCanOpen,
};
