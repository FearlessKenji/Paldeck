const fs = require(`node:fs`);
const os = require(`node:os`);
const path = require(`node:path`);
const { spawnSync } = require(`node:child_process`);

async function validateDatabaseEncryption(projectRoot, assert) {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `paldeck-cipher-smoke-`));
	const plainPath = path.join(tempRoot, `plain.sqlite`);
	const encryptedPath = path.join(tempRoot, `encrypted.sqlite`);
	const envPath = path.join(tempRoot, `.env`);
	const key = `paldeck-smoke-${process.pid}-${Date.now()}`;
	try {
		const Database = require(`better-sqlite3-multiple-ciphers`);
		const plain = new Database(plainPath);
		plain.exec(`CREATE TABLE smoke_rows (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO smoke_rows (value) VALUES ('ready');`);
		plain.close();

		const encryption = require(`../../database/dbEncryption.js`);
		const conversion = encryption.convertPlainDatabaseToEncrypted({
			key,
			root: projectRoot,
			sourcePath: plainPath,
			targetPath: encryptedPath,
		});
		assert(conversion.rowsCopied === 1 && encryption.databaseFileStatus(encryptedPath).encryptedLikely,
			`SQLCipher conversion did not preserve the smoke row in an encrypted file.`);

		fs.writeFileSync(envPath, `PALDECK_DB_KEY=${JSON.stringify(`wrong-production-key`)}\n`);
		const toolScript = [
			`const tool=require('./database/dbToolConnection.js');`,
			`tool.openToolDatabase({dbPath:process.env.PALDECK_DATABASE_PATH,envPath:process.env.PALDECK_ENV_PATH,readonly:true,root:process.cwd()})`,
			`.then(async db=>{const row=await db.get('SELECT value FROM smoke_rows WHERE id = 1');await db.close();`,
			`if(row?.value!=='ready')throw Error('row mismatch');}).catch(error=>{console.error(error);process.exitCode=1;});`,
		].join(``);
		const toolRuntime = spawnSync(process.execPath, [`-e`, toolScript], {
			cwd: projectRoot,
			encoding: `utf8`,
			env: { ...process.env, PALDECK_DATABASE_PATH: encryptedPath, PALDECK_DB_KEY: key, PALDECK_ENV_PATH: envPath },
		});
		assert(toolRuntime.status === 0, `Paldeck's read-only tool connection could not prefer the injected testing key: ${toolRuntime.stderr || toolRuntime.stdout}`);

		const runtimeScript = [
			`const encryption=require('./database/dbEncryption.js');`,
			`const keyInfo=encryption.readDatabaseKeyFromEnv(process.env,process.cwd());`,
			`encryption.verifyEncryptedDatabaseFile({dbPath:process.env.PALDECK_DATABASE_PATH,key:keyInfo.key,root:process.cwd()});`,
			`const {sequelize}=require('./database/dbObjects.js');`,
			`sequelize.query('SELECT value FROM smoke_rows WHERE id = 1').then(([rows])=>{`,
			`if(rows[0]?.value!=='ready')throw Error('row mismatch');`,
			`return sequelize.close();}).catch(error=>{console.error(error);process.exitCode=1;});`,
		].join(``);
		const runtime = spawnSync(process.execPath, [`-e`, runtimeScript], {
			cwd: projectRoot,
			encoding: `utf8`,
			env: {
				...process.env,
				PALDECK_DATABASE_PATH: encryptedPath,
				PALDECK_DB_ENCRYPTION: `encrypted`,
				PALDECK_DB_KEY: key,
			},
		});
		assert(runtime.status === 0, `Paldeck's Sequelize SQLCipher runtime failed: ${runtime.stderr || runtime.stdout}`);
	} finally {
		fs.rmSync(tempRoot, { force: true, recursive: true });
	}
}

module.exports = { validateDatabaseEncryption };
