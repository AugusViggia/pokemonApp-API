const axios = require("axios");
require("dotenv").config();

const { API_URL } = process.env;

const REQUEST_TIMEOUT = 15000;
const DETAIL_BATCH_SIZE = 20;
const RETRIES = 3;
const RETRY_DELAY = 500;
const ALL_POKEMON_LIMIT = 100000;

const isMegaOrGigantamaxForm = (name = "") =>
    /-mega(?:-|$)|-gmax$/.test(name.toLowerCase());

let pokemonListCache = null;
const pokemonDetailsCache = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestWithRetry = async (url) => {
    let lastError;

    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
        try {
            const response = await axios.get(url, {
                timeout: REQUEST_TIMEOUT,
            });
            return response.data;
        } catch (error) {
            lastError = error;

            if (attempt < RETRIES) {
                await sleep(RETRY_DELAY * (attempt + 1));
            }
        }
    }

    throw lastError;
};

const getPokemonList = async () => {
    if (pokemonListCache) return pokemonListCache;

    const response = await requestWithRetry(
        `${API_URL}/pokemon?limit=${ALL_POKEMON_LIMIT}&offset=0`,
    );

    pokemonListCache = response?.results || [];
    return pokemonListCache;
};

const getPokemonDetail = async (url) => {
    if (pokemonDetailsCache.has(url)) {
        return pokemonDetailsCache.get(url);
    }

    const data = await requestWithRetry(url);
    pokemonDetailsCache.set(url, data);
    return data;
};

const getAllPokemonDetails = async () => {
    const pokemonList = await getPokemonList();
    const pokemonData = [];

    for (let i = 0; i < pokemonList.length; i += DETAIL_BATCH_SIZE) {
        const batch = pokemonList.slice(i, i + DETAIL_BATCH_SIZE);

        const results = await Promise.allSettled(
            batch.map((pokemon) => getPokemonDetail(pokemon.url)),
        );

        results.forEach((result, index) => {
            if (result.status === "fulfilled") {
                // PokeAPI exposes alternate forms as extra /pokemon resources.
                // The list must contain one card per species, so only the
                // default variety is kept here.
                if (result.value?.is_default !== false) {
                    pokemonData.push(result.value);
                }
                return;
            }

            console.error(
                `Unable to obtain Pokémon data from ${batch[index].url}:`,
                result.reason?.message || result.reason,
            );
        });
    }

    return pokemonData;
};

const getPokemonDetailsByName = async (name) => {
    const pokemonList = await getPokemonList();
    const search = name.toLowerCase();
    const matches = pokemonList.filter((pokemon) =>
        pokemon.name.toLowerCase().includes(search),
    );

    const results = await Promise.allSettled(
        matches.map((pokemon) => getPokemonDetail(pokemon.url)),
    );

    return results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .filter((pokemon) => pokemon?.is_default !== false);
};

module.exports = {
    getPokemonList,
    getAllPokemonDetails,
    getPokemonDetailsByName,
};
