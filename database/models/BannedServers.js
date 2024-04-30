module.exports = (sequelize, DataTypes) => {
	return sequelize.define('BannedServers', {
		guild_id: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		guild_name: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		owner_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		owner_username: {
			type: DataTypes.STRING,
			allowNull: false,
		},
	}, {
		timestamps: false,
	});
};