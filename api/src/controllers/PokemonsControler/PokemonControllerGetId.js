const { Pokemon, Type, CatalogPokemon } = require("../../db");
const axios = require("axios");
const { pokemonFilterForApi } = require("./FiltersObjectReturns");
require("dotenv").config();
const { API_URL } = process.env;

const normalizeEvolutionDetails = (details = []) =>
  details.map((detail) => ({
    trigger: detail.trigger?.name || null,
    minLevel: detail.min_level ?? null,
    item: detail.item?.name || null,
    heldItem: detail.held_item?.name || null,
    minHappiness: detail.min_happiness ?? null,
    minBeauty: detail.min_beauty ?? null,
    minAffection: detail.min_affection ?? null,
    timeOfDay: detail.time_of_day || null,
    knownMove: detail.known_move?.name || null,
    knownMoveType: detail.known_move_type?.name || null,
    usedMove: detail.used_move?.name || null,
    gender: detail.gender ?? null,
    location: detail.location?.name || null,
    tradeSpecies: detail.trade_species?.name || null,
    partySpecies: detail.party_species?.name || null,
    partyType: detail.party_type?.name || null,
    relativePhysicalStats: detail.relative_physical_stats ?? null,
    nearSpecialRock: detail.near_special_rock || false,
    needsMultiplayer: detail.needs_multiplayer || false,
    needsOverworldRain: detail.needs_overworld_rain || false,
    turnUpsideDown: detail.turn_upside_down || false,
    region: detail.region?.name || null,
    requiredPokemonForm: detail.required_pokemon_form?.name || null,
    evolvedPokemonForm: detail.evolved_pokemon_form?.name || null,
    minMoveCount: detail.min_move_count ?? null,
    minSteps: detail.min_steps ?? null,
    minDamageTaken: detail.min_damage_taken ?? null,
    allowedNatures: Array.isArray(detail.allowed_natures)
      ? detail.allowed_natures.map((nature) => nature?.name).filter(Boolean)
      : [],
    conditionExpression: detail.condition_expression?.expression || null,
  }));

const specialFormsCache = new Map();

const isPikachuCapForm = (name = "") => {
  const lowerName = name.toLowerCase();
  return lowerName.startsWith("pikachu-") && lowerName.includes("cap");
};

const isMegaForm = (name = "") => /-mega(?:-|$)/.test(name.toLowerCase());
const isGigantamaxForm = (name = "") => /-gmax$/.test(name.toLowerCase());

const getSpecialFormRequirement = (name = "") => {
  const lowerName = name.toLowerCase();

  if (isGigantamaxForm(lowerName)) return "Gigantamax";
  if (!isMegaForm(lowerName)) return "Special Form";
  if (lowerName === "rayquaza-mega") return "Mega Evolution (Dragon Ascent)";

  const isMegaX = lowerName.endsWith("-mega-x");
  const isMegaY = lowerName.endsWith("-mega-y");
  const baseName = lowerName
    .replace(/-mega-x$/, "")
    .replace(/-mega-y$/, "")
    .replace(/-mega$/, "");
  const displayBase = baseName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const suffix = isMegaX ? " X" : isMegaY ? " Y" : "";

  return `Mega Evolution (${displayBase}ite${suffix})`;
};

const getFormsForSpecies = async (speciesUrl) => {
  if (!speciesUrl) return { mega: [], gigantamax: [], forms: [] };
  if (specialFormsCache.has(speciesUrl)) {
    return specialFormsCache.get(speciesUrl);
  }

  try {
    const speciesResponse = await axios.get(speciesUrl, { timeout: 10000 });
    const varieties = speciesResponse.data?.varieties || [];
    const specialVarieties = varieties.filter(
      (variety) => variety?.pokemon?.name && !variety.is_default,
    );

    const result = { mega: [], gigantamax: [], forms: [] };
    const responses = await Promise.allSettled(
      specialVarieties.map((variety) =>
        axios.get(variety.pokemon.url, { timeout: 10000 }),
      ),
    );

    responses.forEach((response, index) => {
      if (response.status !== "fulfilled") return;

      const pokemon = response.value.data;
      const varietyName = specialVarieties[index].pokemon.name;
      const image =
        pokemon.sprites?.other?.home?.front_default ||
        pokemon.sprites?.other?.['official-artwork']?.front_default ||
        pokemon.sprites?.front_default ||
        null;

      const specialForm = {
        name: pokemon.name,
        requirement: getSpecialFormRequirement(pokemon.name),
        image,
      };

      if (isMegaForm(varietyName)) {
        result.mega.push(specialForm);
        return;
      }

      if (isGigantamaxForm(varietyName)) {
        result.gigantamax.push(specialForm);
        return;
      }

      // Pikachu's cap variants are promotional costumes rather than useful
      // alternate forms for the Pokédex detail, so keep them out entirely.
      if (isPikachuCapForm(varietyName)) return;

      result.forms.push({
        name: pokemon.name,
        image,
      });
    });

    specialFormsCache.set(speciesUrl, result);
    return result;
  } catch (error) {
    console.error(
      `Unable to obtain forms for ${speciesUrl}:`,
      error.message,
    );
    const emptyResult = { mega: [], gigantamax: [], forms: [] };
    specialFormsCache.set(speciesUrl, emptyResult);
    return emptyResult;
  }
};

const getEvolutionChain = async (node) => {
  if (!node) return null;

  const speciesId = node.species.url.match(/\/pokemon-species\/(\d+)\//)?.[1];
  const specialForms = await getFormsForSpecies(node.species.url);
  const evolvesTo = await Promise.all(
    (node.evolves_to || [])
      .map(getEvolutionChain)
      .map((promise) => promise),
  );

  return {
    name: node.species.name,
    image: speciesId
      ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${speciesId}.png`
      : null,
    evolutionDetails: normalizeEvolutionDetails(node.evolution_details),
    specialForms,
    forms: specialForms.forms,
    evolvesTo: evolvesTo.filter(Boolean),
  };
};

const enrichExternalPokemon = async (pokemon) => {
  const [basePokemon] = pokemonFilterForApi([pokemon]);
  const [speciesResponse, encountersResponse] = await Promise.all([
    axios.get(pokemon.species.url),
    axios.get(pokemon.location_area_encounters),
  ]);

  const evolutionResponse = await axios.get(
    speciesResponse.data.evolution_chain.url,
  );
  const locationsByVersion = {};
  encountersResponse.data.forEach((encounter) => {
    encounter.version_details.forEach((versionDetail) => {
      const versionName = versionDetail.version.name;
      const versionLocations = locationsByVersion[versionName] || [];
      const locationName = encounter.location_area.name.replace(/-/g, " ");
      const existingLocation = versionLocations.find(
        (location) => location.name === locationName,
      );
      const encounters = versionDetail.encounter_details.map((detail) => ({
        method: detail.method?.name || "unknown",
        minLevel: detail.min_level ?? null,
        maxLevel: detail.max_level ?? null,
        chance: detail.chance ?? null,
      }));

      if (existingLocation) {
        existingLocation.encounters.push(...encounters);
      } else {
        versionLocations.push({ name: locationName, image: null, encounters });
      }

      locationsByVersion[versionName] = versionLocations;
    });
  });

  const locations = Object.entries(locationsByVersion).map(
    ([version, versionLocations]) => ({ version, locations: versionLocations }),
  );

  return {
    ...basePokemon,
    evolutionChain: await getEvolutionChain(evolutionResponse.data.chain),
    locations,
    encounterMethods: [
      ...new Set(
        locations.flatMap((version) =>
          version.locations.flatMap((location) =>
            location.encounters.map((encounter) => encounter.method),
          ),
        ),
      ),
    ],
  };
};

const getPokemonById = async (id, source) => {
  const pokemon =
    source === "api"
      ? ((await CatalogPokemon.findByPk(id))?.data || (await axios(`${API_URL}/pokemon/${id}`)).data)
      : await Pokemon.findByPk(id, {
          include: {
            model: Type,
            as: "types",
          },
        });

  if (source === "api") return enrichExternalPokemon(pokemon);

  return {
    ...pokemon.toJSON(),
    evolutionChain: [],
    locations: [],
    encounterMethods: [],
  };
};

module.exports = { getPokemonById };
