const { Pokemon, Type } = require("../../db");

const createPokemon = async (
    name,
    height,
    weight,
    hp,
    image,
    attack,
    defense,
    speed,
    TypeIds
) => {
    const newPokemon = await Pokemon.create({
        name,
        height,
        weight,
        hp,
        image,
        attack,
        defense,
        speed,
    });
    await newPokemon.addTypes(TypeIds);

    const createdPokemon = await Pokemon.findByPk(newPokemon.id, {
        include: {
            model: Type,
            as: "types",
        },
    });
    return createdPokemon;
};

module.exports = { createPokemon };
