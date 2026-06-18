const { sequelize, Channels } = require(`./dbObjects.js`);
const { runMigrations } = require(`./migrations.js`);
const { info } = require(`../utils/writeLog.js`);
const path = require(`node:path`);
const fs = require(`node:fs`);

async function seedChannels() {
	const channels = [
		Channels.upsert({ id: `1221954020424421437`, name: `Suggestions` }),
	];

	await Promise.all(channels);
}

async function dbInit({ force = false } = {}) {
	const dbPath = path.join(__dirname, `database.sqlite`);
	const exists = fs.existsSync(dbPath);

	await sequelize.sync({ force });
	await runMigrations();
	await seedChannels();

	if (force) {
		info(`Database reset and synced`);
		return;
	}

	info(exists ? `Database synced` : `Database created and synced`);
}

if (require.main === module) {
	const force = process.argv.includes(`--force`) || process.argv.includes(`-f`);

	dbInit({ force })
		.catch(err => {
			console.error(err);
			process.exitCode = 1;
		})
		.finally(() => sequelize.close());
}

module.exports = { dbInit };
