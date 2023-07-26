const { Pokemon, Type } = require("../../db");
const axios = require("axios");
const { Op } = require("sequelize");
const { pokemonFilterForApi, pokemonFilterDb } =
    require("./FiltersObjectReturns");
require("dotenv").config();
const { API_URL } = process.env;

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

    const apiPokemonsRaw = await axios(
        `${API_URL}/pokemon?limit=251`
    );

    const pokemonData = apiPokemonsRaw.data.results;

    const pokemonUrlRequests = pokemonData.map((pokemon) =>
        axios.get(pokemon.url)
    );

    const pokemonUrlResponses = await Promise.all(pokemonUrlRequests);

    const pokemonDataDetailed = pokemonUrlResponses.map(
        (response) => response.data
    );

    const filteredInApi = pokemonDataDetailed.filter((pokemon) =>
        pokemon.name.toLowerCase().includes(nameToLowerCase)
    );

    const dataBaseFiltered = pokemonFilterDb(dataBasePokemons);
    const apiFilteredInfo = pokemonFilterForApi(filteredInApi)

    return [...dataBaseFiltered, ...apiFilteredInfo];
};

module.exports = { getPokemonByName };
