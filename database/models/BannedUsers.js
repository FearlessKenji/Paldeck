module.exports = (sequelize, DataTypes) => {
	return sequelize.define('BannedUsers', {
		user_id: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		user_username: {
			type: DataTypes.STRING,
			allowNull: false,
		},
	}, {
		timestamps: false,
	});
};