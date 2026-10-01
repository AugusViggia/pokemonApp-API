const { Pokemon, Type } = require("../../db");
const { pokemonFilterForApi, pokemonFilterDb } =
    require("./FiltersObjectReturns");
const { getAllPokemonDetails } = require("../../services/pokeApiService");

const getAllPokemons = async () => {
    const dataBasePokemons = await Pokemon.findAll({
        include: {
            model: Type,
            as: "types",
            attributes: ["name"],
        },
    });

    const apiPokemonData = await getAllPokemonDetails();
    const apiPokemons = pokemonFilterForApi(apiPokemonData);
    const dataBaseFiltered = pokemonFilterDb(dataBasePokemons);

    return [...dataBaseFiltered, ...apiPokemons];
};

module.exports = {
    getAllPokemons,
};
