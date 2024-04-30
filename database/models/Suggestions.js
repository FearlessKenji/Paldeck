module.exports = (sequelize, DataTypes) => {
	return sequelize.define('Suggestions', {
		suggestion: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		author:{
			type: DataTypes.STRING,
			allowNull: true,
		},
		suggestion_id: {
			type: DataTypes.STRING,
			allowNull: true,
		},
		accepted: {
			type: DataTypes.BOOLEAN,
			allowNull: true,
		},
	}, {
		timestamps: false,
	});
};