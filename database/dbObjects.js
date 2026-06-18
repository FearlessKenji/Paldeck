const Sequelize = require(`sequelize`);
const path = require(`node:path`);

const sequelize = new Sequelize(`database`, `username`, `password`, {
	host: `localhost`,
	dialect: `sqlite`,
	logging: false,
	storage: path.join(__dirname, `database.sqlite`),
});

const BannedServers = require(`./models/BannedServers.js`)(sequelize, Sequelize.DataTypes);
const JoinedServers = require(`./models/JoinedServers.js`)(sequelize, Sequelize.DataTypes);
const BannedUsers = require(`./models/BannedUsers.js`)(sequelize, Sequelize.DataTypes);
const Suggestions = require(`./models/Suggestions.js`)(sequelize, Sequelize.DataTypes);
const Channels = require(`./models/Channels.js`)(sequelize, Sequelize.DataTypes);
const SearchSessions = require(`./models/SearchSessions.js`)(sequelize, Sequelize.DataTypes);
const SchemaMigrations = require(`./models/SchemaMigrations.js`)(sequelize, Sequelize.DataTypes);

BannedServers.belongsTo(BannedUsers, { foreignKey: `owner_id`, targetKey: `user_id` });
BannedUsers.hasMany(BannedServers, { foreignKey: `owner_id`, sourceKey: `user_id` });

module.exports = { sequelize, Channels, JoinedServers, BannedServers, BannedUsers, Suggestions, SearchSessions, SchemaMigrations };
