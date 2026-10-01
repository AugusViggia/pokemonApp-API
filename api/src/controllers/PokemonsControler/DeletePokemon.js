const { Pokemon } = require("../../db");

const deletePokemon = async (id) => {
  const pokemon = await Pokemon.findByPk(id);

  if (!pokemon) {
    const error = new Error("Pokemon was not found or cannot be deleted");
    error.status = 404;
    throw error;
  }

  // Delete the many-to-many rows explicitly before deleting the Pokemon.
  // This avoids relying on setTypes([]) when the junction table constraints
  // are not aligned with Sequelize's association helper.
  const association = Pokemon.associations.types;
  const throughModel = association?.through?.model;
  const foreignKey = association?.foreignKey;

  if (throughModel && foreignKey) {
    await throughModel.destroy({
      where: { [foreignKey]: id },
    });
  }

  await pokemon.destroy();
  return true;
};

module.exports = { deletePokemon };
