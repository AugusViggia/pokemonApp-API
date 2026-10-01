const axios = require("axios");
require("dotenv").config();

const { API_URL } = process.env;

const REQUEST_TIMEOUT = 10000;
const MAX_RETRIES = 3;
const BATCH_SIZE = 20;

let pokemonCache = null;
let pokemonCachePromise = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getWithRetry = async (url) => {
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
      });

      return response.data;
    } catch (error) {
      lastError = error;

      if (attempt < MAX_RETRIES) {
        await sleep(300 * (attempt + 1));
      }
    }
  }

  throw lastError;
};

const fetchAllPokemonResources = async () => {
  const response = await axios.get(`${API_URL}/pokemon?limit=100000&offset=0`, {
    timeout: REQUEST_TIMEOUT,
  });

  return response.data?.results || [];
};

const loadAllPokemon = async () => {
  if (pokemonCache) {
    return pokemonCache;
  }

  if (pokemonCachePromise) {
    return pokemonCachePromise;
  }

  pokemonCachePromise = (async () => {
    const resources = await fetchAllPokemonResources();
    const pokemonData = [];

    for (let i = 0; i < resources.length; i += BATCH_SIZE) {
      const batch = resources.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((pokemon) => getWithRetry(pokemon.url))
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          // Keep one entry per Pokémon species. Alternate forms are exposed
          // by PokeAPI as additional /pokemon resources with is_default=false.
          if (result.value?.is_default !== false) {
            pokemonData.push(result.value);
          }
        } else {
          console.error(
            `Unable to obtain Pokémon data from ${batch[index].url}:`,
            result.reason?.message || result.reason
          );
        }
      });
    }

    pokemonCache = pokemonData;
    pokemonCachePromise = null;

    return pokemonCache;
  })().catch((error) => {
    pokemonCachePromise = null;
    throw error;
  });

  return pokemonCachePromise;
};

module.exports = {
  loadAllPokemon,
};
