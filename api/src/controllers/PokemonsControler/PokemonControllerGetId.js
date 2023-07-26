const { Pokemon, Type } = require("../../db");
const axios = require("axios");
const { pokemonFilterForApi } =
    require("./FiltersObjectReturns");
require("dotenv").config();
const { API_URL } = process.env;

const getPokemonById = async (id, source) => {
    const pokemon =
        source === "api"
            ? (await axios(`${API_URL}/pokemon/${id}`)).data
            : await Pokemon.findByPk(id, {
                include: {
                    model: Type,
                    as: "types",
                },
            });

    return source === "api" ? pokemonFilterForApi([pokemon]) : pokemon;
};

module.exports =  { getPokemonById };