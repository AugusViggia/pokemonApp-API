const { createPokemon } = require('../../controllers/PokemonsControler/CreatePokemon');

const OK = 200;
const err = 400;

const postPokemonHandler = async (req, res) => {
    const { name, height, weight, hp, image, attack, defense, speed, types } =
        req.body;

    try {
        const newPokemon = await createPokemon(
            name,
            height,
            weight,
            hp,
            image,
            attack,
            defense,
            speed,
            types
        );
        res.status(OK).json({ newPokemon });
    } catch (error) {
        res.status(err).json({ error: error.message });
    }
};

module.exports = {
    postPokemonHandler
}