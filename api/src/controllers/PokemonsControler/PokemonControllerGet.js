const { Pokemon, Type } = require("../../db");
const axios = require("axios");
const { pokemonFilterForApi, pokemonFilterDb } =
    require("./FiltersObjectReturns");
require("dotenv").config();
const { API_URL } = process.env;

const getAllPokemons = async () => {
    const dataBasePokemons = await Pokemon.findAll({
        include: {
            model: Type,
            as: "types",
            attributes: ["name"],
        },
    });

    const apiPokemonsRaw = await axios(`${API_URL}/pokemon?limit=251`);

    const pokemonUrls = apiPokemonsRaw.data?.results.map(
        (pokemon) => pokemon.url
    );
    const pokemonUrlRequests = pokemonUrls.map((url) => axios.get(url));

    const pokemonUrlResponses = await Promise.all(pokemonUrlRequests);

    const pokemonData = pokemonUrlResponses.map((response) => response.data);

    const apiPokemons = pokemonFilterForApi(pokemonData);

    const dataBaseFiltered = pokemonFilterDb(dataBasePokemons);

    return [...dataBaseFiltered, ...apiPokemons];
};

module.exports = {
    getAllPokemons,
};
