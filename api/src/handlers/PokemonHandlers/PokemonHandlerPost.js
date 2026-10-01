const {
  createPokemon,
} = require("../../controllers/PokemonsControler/CreatePokemon");
const { Type } = require("../../db");

const OK = 200;
const err = 400;

const postPokemonHandler = async (req, res) => {
  const { name, height, weight, hp, image, shinyImage, attack, defense, speed, types } =
    req.body;

  try {
    const numericFields = { height, weight, hp, attack, defense, speed };
    const invalidNumber = Object.entries(numericFields).some(([, value]) => {
      const number = Number(value);
      return !Number.isInteger(number) || number < 1 || number > 999;
    });
    const typeIds = Array.isArray(types)
      ? types.map((typeId) => Number(typeId)).filter(Number.isInteger)
      : [];
    const existingTypes = typeIds.length
      ? await Type.count({ where: { id: typeIds } })
      : 0;

    const validationErrors = [];
    if (!name || name.trim().length < 4 || name.trim().length > 20)
      validationErrors.push("name must have 4-20 characters");
    if (!image) validationErrors.push("image is required");
    if (shinyImage && !/^data:image\/(jpeg|jpg);base64,/i.test(shinyImage)) {
      validationErrors.push("shinyImage must be a JPEG data URL when provided");
    }
    if (typeIds.length === 0 || existingTypes !== typeIds.length)
      validationErrors.push("select at least one valid type");
    if (invalidNumber)
      validationErrors.push("each stat must be an integer from 1 to 999");

    if (validationErrors.length > 0) {
      return res.status(err).json({
        error: "Pokemon could not be created",
        details: validationErrors,
      });
    }

    const newPokemon = await createPokemon(
      name,
      height,
      weight,
      hp,
      image,
      shinyImage,
      attack,
      defense,
      speed,
      typeIds,
    );
    res.status(OK).json({ newPokemon });
  } catch (error) {
    console.error("Error creating Pokemon:", error);
    res.status(err).json({
      error: "Pokemon could not be created",
      details: [error.message],
      code: error.original?.code || error.code || "UNKNOWN_ERROR",
    });
  }
};

module.exports = {
  postPokemonHandler,
};
