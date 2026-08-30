const Sequelize = require(`sequelize`);
const path = require(`node:path`);
const { isEncryptedDatabaseRuntimeEnabled } = require(`./dbEncryption.js`);

const databasePath = path.resolve(process.env.PALDECK_DATABASE_PATH || path.join(__dirname, `database.sqlite`));
const encryptedRuntimeEnabled = isEncryptedDatabaseRuntimeEnabled(process.env.PALDECK_DB_ENCRYPTION);
const sequelizeOptions = {
	host: `localhost`,
	dialect: `sqlite`,
	logging: false,
	// Tests can isolate SQLite state without touching the configured production database.
	storage: databasePath,
};

if (encryptedRuntimeEnabled) {
	// Sequelize expects sqlite3's callback API; this adapter supplies that API
	// while opening the file with Paldeck's configured SQLCipher key.
	sequelizeOptions.dialectModule = require(`./sqlcipherSqlite3.js`);
}

// SQLite does not use account credentials. Keeping these empty also prevents
// Sequelize from issuing a PRAGMA KEY that would replace the SQLCipher key.
const sequelize = new Sequelize(`database`, ``, ``, sequelizeOptions);

const BannedServers = require(`./models/BannedServers.js`)(sequelize, Sequelize.DataTypes);
const JoinedServers = require(`./models/JoinedServers.js`)(sequelize, Sequelize.DataTypes);
const BannedUsers = require(`./models/BannedUsers.js`)(sequelize, Sequelize.DataTypes);
const Suggestions = require(`./models/Suggestions.js`)(sequelize, Sequelize.DataTypes);
const Channels = require(`./models/Channels.js`)(sequelize, Sequelize.DataTypes);
const SearchSessions = require(`./models/SearchSessions.js`)(sequelize, Sequelize.DataTypes);
const SchemaMigrations = require(`./models/SchemaMigrations.js`)(sequelize, Sequelize.DataTypes);
const BotSettings = require(`./models/BotSettings.js`)(sequelize, Sequelize.DataTypes);

BannedServers.belongsTo(BannedUsers, { foreignKey: `owner_id`, targetKey: `user_id` });
BannedUsers.hasMany(BannedServers, { foreignKey: `owner_id`, sourceKey: `user_id` });

module.exports = {
	databasePath,
	sequelize, BotSettings, Channels, JoinedServers, BannedServers, BannedUsers,
	Suggestions, SearchSessions, SchemaMigrations,
};
