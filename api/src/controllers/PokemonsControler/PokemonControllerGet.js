const { Pokemon, Type, CatalogPokemon } = require("../../db");
const { pokemonFilterForApi, pokemonFilterDb } =
    require("./FiltersObjectReturns");
const { ensurePokemonCatalog } = require("../../services/pokeApiService");

const getAllPokemons = async () => {
    await ensurePokemonCatalog();

    const [dataBasePokemons, catalogRows] = await Promise.all([
        Pokemon.findAll({
            include: {
                model: Type,
                as: "types",
                attributes: ["name"],
            },
        }),
        CatalogPokemon.findAll({
            where: { isDefault: true },
            order: [["id", "ASC"]],
            attributes: ["data"],
        }),
    ]);

    return [
        ...pokemonFilterDb(dataBasePokemons),
        ...pokemonFilterForApi(catalogRows.map((row) => row.data)),
    ];
};

module.exports = {
    getAllPokemons,
};
