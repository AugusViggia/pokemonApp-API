const { Pokemon, Type, CatalogPokemon } = require("../../db");
const { Op } = require("sequelize");
const { pokemonFilterForApi, pokemonFilterDb } =
    require("./FiltersObjectReturns");
const { ensurePokemonCatalog } = require("../../services/pokeApiService");

const getPokemonByName = async (name) => {
    const nameToLowerCase = name.toLowerCase();
    await ensurePokemonCatalog();

    const where = { name: { [Op.iLike]: `%${nameToLowerCase}%` } };
    const [dataBasePokemons, catalogRows] = await Promise.all([
        Pokemon.findAll({
            where,
            include: {
                model: Type,
                as: "types",
                attributes: ["name"],
            },
        }),
        CatalogPokemon.findAll({
            where: { ...where, isDefault: true },
            order: [["id", "ASC"]],
            attributes: ["data"],
        }),
    ]);

    return [
        ...pokemonFilterDb(dataBasePokemons),
        ...pokemonFilterForApi(catalogRows.map((row) => row.data)),
    ];
};

module.exports = { getPokemonByName };
