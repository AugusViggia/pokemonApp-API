const { Router } = require("express");
const {
  getPokemonsHandler,
  getPokemonByIdHandler,
  getPokemonByNameHandler,
} = require("../handlers/PokemonHandlers/PokemonHandlersGet");
const {
  postPokemonHandler,
} = require("../handlers/PokemonHandlers/PokemonHandlerPost");
const {
  deletePokemonHandler,
} = require("../handlers/PokemonHandlers/PokemonHandlerDelete");

const pokemonRouter = Router();

pokemonRouter.get("/", getPokemonsHandler);
pokemonRouter.delete("/:id", deletePokemonHandler);
pokemonRouter.get("/:id", getPokemonByIdHandler);
pokemonRouter.get("/name?", getPokemonByNameHandler);
pokemonRouter.post("/post", postPokemonHandler);

module.exports = pokemonRouter;
