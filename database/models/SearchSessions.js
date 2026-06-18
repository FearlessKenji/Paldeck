module.exports = (sequelize, DataTypes) => {
	return sequelize.define(`SearchSessions`, {
		search_id: {
			type: DataTypes.STRING,
			primaryKey: true,
		},
		user_id: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		criteria: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		results: {
			type: DataTypes.TEXT,
			allowNull: false,
		},
		expires_at: {
			type: DataTypes.INTEGER,
			allowNull: false,
		},
	}, {
		timestamps: false,
	});
};
