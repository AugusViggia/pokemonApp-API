const { Router } = require('express');
const {
  getPokemonsHandler,
  getPokemonByIdHandler,
  getPokemonByNameHandler
} = require("../handlers/PokemonHandlers/PokemonHandlersGet");
const { postPokemonHandler } = require('../handlers/PokemonHandlers/PokemonHandlerPost');

const pokemonRouter = Router();

pokemonRouter.get('/', getPokemonsHandler);
pokemonRouter.get('/:id', getPokemonByIdHandler);
pokemonRouter.get('/name?', getPokemonByNameHandler);
pokemonRouter.post('/post', postPokemonHandler);

module.exports = pokemonRouter;