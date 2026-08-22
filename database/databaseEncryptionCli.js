// Transactional database encryption and verification adapter for HachiGen.
const crypto = require(`node:crypto`);
const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const {
	convertPlainDatabaseToEncrypted,
	databaseFileStatus,
	readDatabaseKeyFromEnvFile,
	verifyEncryptedDatabaseFile,
} = require(`./dbEncryption.js`);

const projectRoot = path.resolve(__dirname, `..`);
const databasePath = path.join(__dirname, `database.sqlite`);
const envPath = path.join(projectRoot, `.env`);

function recommendedKeyPath() {
	const home = os.homedir();
	if (process.platform === `win32`) {
		return path.join(process.env.APPDATA || path.join(home, `AppData`, `Roaming`), `Paldeck`, `db.key`);
	}
	if (process.platform === `darwin`) {
		return path.join(home, `Library`, `Application Support`, `Paldeck`, `db.key`);
	}
	return path.join(process.env.XDG_CONFIG_HOME || path.join(home, `.config`), `paldeck`, `db.key`);
}

function envValue(value) {
	return JSON.stringify(String(value || ``));
}

function updateEnv(content, values) {
	const pending = new Map(Object.entries(values));
	const lines = String(content || ``).split(/\r?\n/u);
	const output = [];
	for (const line of lines) {
		const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/u);
		if (!match || !pending.has(match[1])) {
			if (line || output.length) {
				output.push(line);
			}
			continue;
		}
		output.push(`${match[1]}=${envValue(pending.get(match[1]))}`);
		pending.delete(match[1]);
	}
	for (const [key, value] of pending) {
		output.push(`${key}=${envValue(value)}`);
	}
	return `${output.filter((line, index, all) => line || index < all.length - 1).join(`\n`)}\n`;
}

function removeSidecars(filePath) {
	for (const suffix of [`-wal`, `-shm`, `-journal`]) {
		fs.rmSync(`${filePath}${suffix}`, { force: true });
	}
}

function ensureKey(databaseStatus) {
	let keyInfo;
	try {
		keyInfo = readDatabaseKeyFromEnvFile(envPath, process.env, projectRoot);
	} catch (error) {
		throw new Error(`Configured Paldeck database key could not be read: ${error.message}`, { cause: error });
	}
	if (keyInfo.key) {
		return keyInfo;
	}
	if (databaseStatus.encryptedLikely) {
		throw new Error(`Paldeck's database is encrypted but its original key is unavailable.`);
	}
	const keyFilePath = recommendedKeyPath();
	fs.mkdirSync(path.dirname(keyFilePath), { recursive: true });
	if (!fs.existsSync(keyFilePath)) {
		fs.writeFileSync(keyFilePath, `${crypto.randomBytes(32).toString(`base64url`)}\n`, { mode: 0o600 });
	}
	try {
		fs.chmodSync(path.dirname(keyFilePath), 0o700);
		fs.chmodSync(keyFilePath, 0o600);
	} catch {
		// Windows ACLs do not map directly to POSIX modes; the user-scoped path remains authoritative.
	}
	return { key: fs.readFileSync(keyFilePath, `utf8`).trim(), keyFilePath, source: `file` };
}

function verify() {
	const status = databaseFileStatus(databasePath);
	if (!status.encryptedLikely) {
		throw new Error(`Paldeck database is not encrypted.`);
	}
	const keyInfo = readDatabaseKeyFromEnvFile(envPath, process.env, projectRoot);
	if (!keyInfo.key) {
		throw new Error(`No Paldeck database key is configured.`);
	}
	const result = verifyEncryptedDatabaseFile({ dbPath: databasePath, key: keyInfo.key, root: projectRoot });
	process.stdout.write(JSON.stringify({ ...result, keySource: keyInfo.source }));
}

function encrypt() {
	if (!fs.existsSync(databasePath)) {
		throw new Error(`Paldeck database does not exist.`);
	}
	const before = databaseFileStatus(databasePath);
	const keyInfo = ensureKey(before);
	if (before.encryptedLikely) {
		verifyEncryptedDatabaseFile({ dbPath: databasePath, key: keyInfo.key, root: projectRoot });
		process.stdout.write(JSON.stringify({ alreadyEncrypted: true, ok: true }));
		return;
	}
	if (before.status !== `plaintext`) {
		throw new Error(`Unsupported database state: ${before.label}.`);
	}
	const timestamp = new Date().toISOString().replace(/\D/gu, ``).slice(0, 14);
	const recoveryPath = `${databasePath}.pre-encryption-${timestamp}`;
	const encryptedPath = `${databasePath}.encrypted-${process.pid}.tmp`;
	const originalEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, `utf8`) : ``;
	fs.copyFileSync(databasePath, recoveryPath, fs.constants.COPYFILE_EXCL);
	try {
		convertPlainDatabaseToEncrypted({ key: keyInfo.key, root: projectRoot, sourcePath: databasePath, targetPath: encryptedPath });
		verifyEncryptedDatabaseFile({ dbPath: encryptedPath, key: keyInfo.key, root: projectRoot });
		fs.copyFileSync(encryptedPath, databasePath);
		removeSidecars(databasePath);
		fs.writeFileSync(envPath, updateEnv(originalEnv, {
			PALDECK_DB_ENCRYPTION: `encrypted`,
			PALDECK_DB_KEY: keyInfo.source === `direct` ? keyInfo.key : ``,
			PALDECK_DB_KEY_FILE: keyInfo.keyFilePath || ``,
		}), `utf8`);
		verifyEncryptedDatabaseFile({ dbPath: databasePath, key: keyInfo.key, root: projectRoot });
		process.stdout.write(JSON.stringify({ backupPath: recoveryPath, ok: true }));
	} catch (error) {
		fs.copyFileSync(recoveryPath, databasePath);
		removeSidecars(databasePath);
		fs.writeFileSync(envPath, originalEnv, `utf8`);
		throw error;
	} finally {
		fs.rmSync(encryptedPath, { force: true });
		removeSidecars(encryptedPath);
	}
}

try {
	if (process.argv.includes(`--verify`)) {
		verify();
	} else if (process.argv.includes(`--encrypt`)) {
		encrypt();
	} else {
		throw new Error(`Use --encrypt or --verify.`);
	}
} catch (error) {
	console.error(error.message || String(error));
	process.exitCode = 1;
}
