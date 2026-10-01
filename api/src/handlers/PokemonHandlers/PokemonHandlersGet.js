const { getPaginatedPokemons } = require('../../controllers/PokemonsControler/PokemonControllerGet');
const { getPokemonById } = require('../../controllers/PokemonsControler/PokemonControllerGetId');
const { getPokemonByName } = require('../../controllers/PokemonsControler/PokemonControllerGetName');

const OK = 200;
const ERR = 400;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

class QueryValidationError extends Error {}

const parsePositiveInteger = (value, name, defaultValue) => {
    if (value === undefined) return defaultValue;
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
        throw new QueryValidationError(`${name} must be a positive integer`);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new QueryValidationError(`${name} is too large`);
    }
    return parsed;
};

const parseTypes = (value) => {
    if (value === undefined) return [];
    const values = Array.isArray(value) ? value : [value];
    if (values.some((type) => typeof type !== "string")) {
        throw new QueryValidationError("type must be a type name or comma-separated type names");
    }
    const types = [...new Set(values
        .flatMap((type) => type.split(","))
        .map((type) => type.trim().toLowerCase())
        .filter(Boolean))];
    if (types.length > 2 || types.some((type) => !/^[a-z0-9-]{1,40}$/.test(type))) {
        throw new QueryValidationError("type accepts up to two valid type names");
    }
    return types;
};

const parseOrigin = (value) => {
    if (value === undefined || value === "all" || value === "") return null;
    if (value === "created" || value === "data base") return true;
    if (value === "api" || value === "existing") return false;
    throw new QueryValidationError("origin must be all, created, or api");
};

const parseSort = (value, name, allowed) => {
    const sort = value === undefined ? "all" : value;
    if (typeof sort !== "string" || !allowed.includes(sort)) {
        throw new QueryValidationError(`${name} has an unsupported value`);
    }
    return sort;
};

const getPokemonsHandler = async (req, res) => {
    try {
        const page = parsePositiveInteger(req.query.page, "page", 1);
        const requestedLimit = parsePositiveInteger(req.query.limit, "limit", DEFAULT_LIMIT);
        const limit = Math.min(requestedLimit, MAX_LIMIT);
        if (!Number.isSafeInteger((page - 1) * limit)) {
            throw new QueryValidationError("page is too large");
        }

        const nameValue = req.query.name;
        if (nameValue !== undefined && typeof nameValue !== "string") {
            throw new QueryValidationError("name must be a single search term");
        }

        const result = await getPaginatedPokemons({
            page,
            limit,
            name: nameValue?.trim().slice(0, 100) || null,
            types: parseTypes(req.query.type),
            origin: parseOrigin(req.query.origin),
            sortName: parseSort(req.query.sortName, "sortName", ["all", "name-asc", "name-desc"]),
            sortAttack: parseSort(req.query.sortAttack, "sortAttack", ["all", "attack-asc", "attack-desc"]),
        });
        return res.status(OK).json(result);
    } catch (error) {
        if (error instanceof QueryValidationError) {
            return res.status(ERR).json({ error: error.message });
        }
        console.error("Error obtaining PokÃ©mon catalog:", error);
        return res.status(500).json({ error: "Unable to obtain PokÃ©mon catalog" });
    }
};

const getPokemonByIdHandler = async (req, res) => {
    const { id } = req.params;
    const source = isNaN(id) ? "bdd" : "api";

    try {
        const pokemon = await getPokemonById(id, source);
        res.status(OK).send(pokemon);
    } catch (error) {
        res.status(ERR).json({ error: error.message });
    }
};

const getPokemonByNameHandler = async (req, res) => {
    try {
        const name = req.params.name || req.query.name;
        if (!name || typeof name !== "string") {
            return res.status(ERR).json({ error: "name is required" });
        }
        const pokemon = await getPokemonByName(name);
        return res.status(OK).json(pokemon);
    } catch (error) {
        return res.status(ERR).json({ error: error.message });
    }
};

module.exports = {
    getPokemonsHandler,
    getPokemonByIdHandler,
    getPokemonByNameHandler,
};
