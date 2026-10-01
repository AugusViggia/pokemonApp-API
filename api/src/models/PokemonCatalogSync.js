const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  sequelize.define(
    "PokemonCatalogSync",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "never",
      },
      lastAttemptAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      lastSuccessfulAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resourceCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      defaultPokemonCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      failedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    { timestamps: false },
  );
};
