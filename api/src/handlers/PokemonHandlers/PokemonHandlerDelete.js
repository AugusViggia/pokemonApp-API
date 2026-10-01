const {
  deletePokemon,
} = require("../../controllers/PokemonsControler/DeletePokemon");

const deletePokemonHandler = async (req, res) => {
  try {
    await deletePokemon(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

module.exports = { deletePokemonHandler };
