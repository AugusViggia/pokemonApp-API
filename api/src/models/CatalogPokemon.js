const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  sequelize.define(
    "CatalogPokemon",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      isDefault: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      data: {
        type: DataTypes.JSONB,
        allowNull: false,
      },
      syncedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      timestamps: false,
      indexes: [{ fields: ["name"] }],
    },
  );
};
