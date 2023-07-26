const { getAllPokemons } = require('../../controllers/PokemonsControler/PokemonControllerGet');
const { getPokemonById } = require('../../controllers/PokemonsControler/PokemonControllerGetId');
const {
    getPokemonByName
} = require("../../controllers/PokemonsControler/PokemonControllerGetName");

const OK = 200;
const err = 400;

const getPokemonsHandler = async (req, res) => {
    const { name } = req.query;

    const results = name ? await getPokemonByName(name) : await getAllPokemons();

    res.status(OK).json(results);
};

const getPokemonByIdHandler = async (req, res) => {
    const { id } = req.params;
    const source = isNaN(id) ? "bdd" : "api";

    try {
        const pokemon = await getPokemonById(id, source);
        res.status(OK).send(pokemon);
    } catch (error) {
        res.status(err).json({ error: error.message });
    }
};

const getPokemonByNameHandler = async (req, res) => {
    const { name } = req.query;

    try {
        const pokemon = await getPokemonByName(name);

        if (pokemon.length > 0) {
            res.status(OK).json(pokemon);
        } else {
            res.status(OK).json([]);
        }
    } catch (error) {
        res.status(err).json({ error: error.message });
    }
};

module.exports = {
    getPokemonsHandler,
    getPokemonByIdHandler,
    getPokemonByNameHandler,
};