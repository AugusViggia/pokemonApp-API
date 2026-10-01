const { Pokemon, Type } = require("../../db");
const { Op } = require("sequelize");
const { pokemonFilterForApi, pokemonFilterDb } =
    require("./FiltersObjectReturns");
const { getPokemonDetailsByName } = require("../../services/pokeApiService");

const getPokemonByName = async (name) => {
    const nameToLowerCase = name.toLowerCase();

    const dataBasePokemons = await Pokemon.findAll({
        where: {
            name: { [Op.iLike]: `%${nameToLowerCase}%` },
        },
        include: {
            model: Type,
            as: "types",
            attributes: ["name"],
        },
    });

    const pokemonDataDetailed = await getPokemonDetailsByName(nameToLowerCase);

    const filteredInApi = pokemonDataDetailed.filter((pokemon) =>
        pokemon.name.toLowerCase().includes(nameToLowerCase),
    );

    return [
        ...pokemonFilterDb(dataBasePokemons),
        ...pokemonFilterForApi(filteredInApi),
    ];
};

module.exports = { getPokemonByName };
