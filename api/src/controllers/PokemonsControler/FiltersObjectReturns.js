const pokemonFilterForApi = (arr) =>
    arr.map((pokemon) => {
        return {
            id: pokemon.id,
            name: pokemon.name,
            height: pokemon.height,
            weight: pokemon.weight,
            hp: pokemon.stats[0].base_stat,
            image: pokemon.sprites.other.dream_world.front_default,
            attack: pokemon.stats[1].base_stat,
            defense: pokemon.stats[2].base_stat,
            speed: pokemon.stats[5].base_stat,
            types: pokemon.types.map((t) => t.type.name),
            created: false,
        };
    });

const pokemonFilterDb = (arr) =>
    arr.map((pokemon) => {
        return {
            id: pokemon.id,
            name: pokemon.name,
            height: pokemon.height,
            weight: pokemon.weight,
            hp: pokemon.hp,
            image: pokemon.image,
            attack: pokemon.attack,
            defense: pokemon.defense,
            speed: pokemon.speed,
            types: pokemon.types.map((type) => type.name),
        };
    });

module.exports =  {
    pokemonFilterForApi,
    pokemonFilterDb,
};
