const Sequelize = require('sequelize');

const sequelize = new Sequelize('database', 'username', 'password', {
	host: 'localhost',
	dialect: 'sqlite',
	logging: false,
	storage: 'database/database.sqlite',
});

const BannedServers = require('./models/BannedServers.js')(sequelize, Sequelize.DataTypes);
const JoinedServers = require('./models/JoinedServers.js')(sequelize, Sequelize.DataTypes);
const BannedUsers = require('./models/BannedUsers.js')(sequelize, Sequelize.DataTypes);
const Suggestions = require('./models/Suggestions.js')(sequelize, Sequelize.DataTypes);
const Channels = require('./models/Channels.js')(sequelize, Sequelize.DataTypes);

BannedServers.belongsTo(BannedUsers, { foreignKey: 'owner_id', targetKey: 'user_id' });
BannedServers.belongsTo(BannedUsers, { foreignKey: 'owner_username', targetKey: 'user_username' });
BannedUsers.hasOne(BannedServers, { foreignKey: 'owner_id', targetKey: 'user_id' });
BannedUsers.hasOne(BannedServers, { foreignKey: 'owner_username', targetKey: 'user_username' });

module.exports = { Channels, JoinedServers, BannedServers, BannedUsers, Suggestions };
