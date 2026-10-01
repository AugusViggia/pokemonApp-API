const test = require("node:test");
const assert = require("node:assert/strict");
const { createPokemonCatalogSync } = require("../src/services/pokeApiService");
const { Pokemon, Type, CatalogPokemon, PokemonCatalogSync, conn } = require("../src/db");
const app = require("../src/app");
const axios = require("axios");

const createHarness = ({ pages, details = {}, existing = [], options = {} }) => {
  const rows = new Map(existing.map((row) => [row.id, row]));
  const state = new Map();
  const requests = [];
  const logs = [];
  const errors = [];
  let currentTime = new Date("2026-10-01T12:00:00.000Z");
  let pageIndex = 0;

  const catalogPokemon = {
    count: async () => rows.size,
    findAll: async () => [...rows.values()].map(({ id, isDefault }) => ({ id, isDefault })),
    bulkCreate: async (batch) => {
      batch.forEach((row) => {
        if (!rows.has(row.id)) rows.set(row.id, row);
      });
    },
  };
  const syncState = {
    findByPk: async (id) => state.get(id) || null,
    upsert: async (row) => state.set(row.id, row),
  };
  const sequelize = {
    transaction: async (callback) => callback({}),
  };
  const http = {
    get: async (url) => {
      requests.push(url);
      if (url.includes("/pokemon?")) {
        const page = pages[pageIndex];
        pageIndex += 1;
        return { data: page };
      }
      const detail = typeof details === "function" ? details(url) : details[url];
      if (detail instanceof Error) throw detail;
      if (!detail) throw new Error(`Unexpected detail request: ${url}`);
      return { data: detail };
    },
  };

  const service = createPokemonCatalogSync({
    catalogPokemon,
    syncState,
    sequelize,
    http,
    apiUrl: "https://pokeapi.example/api/v2",
    logger: { log: (...args) => logs.push(args.join(" ")), error: (...args) => errors.push(args.join(" ")) },
    now: () => currentTime,
    retries: 0,
    ...options,
  });

  return {
    ...service,
    rows,
    state,
    requests,
    logs,
    errors,
    advanceTime: (ms) => { currentTime = new Date(currentTime.getTime() + ms); },
  };
};

test("discovers later pages and downloads only resources missing from PostgreSQL", async () => {
  const harness = createHarness({
    existing: [{ id: 1, name: "bulbasaur", isDefault: true, data: { name: "bulbasaur" } }],
    pages: [
      {
        count: 2,
        next: "https://pokeapi.example/api/v2/pokemon?limit=100&offset=1",
        results: [{ name: "bulbasaur", url: "https://pokeapi.example/api/v2/pokemon/1/" }],
      },
      {
        count: 2,
        next: null,
        results: [{ name: "ivysaur", url: "https://pokeapi.example/api/v2/pokemon/2/" }],
      },
    ],
    details: {
      "https://pokeapi.example/api/v2/pokemon/2/": { id: 2, name: "ivysaur", is_default: true },
    },
  });

  const result = await harness.syncPokemonCatalog({ force: true });

  assert.equal(result.status, "complete");
  assert.equal(result.savedCount, 1);
  assert.deepEqual([...harness.rows.keys()], [1, 2]);
  assert.equal(harness.requests.filter((url) => /\/pokemon\/\d+\/$/.test(url)).length, 1);
  assert.equal(harness.state.get(1).resourceCount, 2);
});

test("continues after one detail fails, keeps saved data, and retries failed resources later", async () => {
  const detailCalls = new Map();
  let recovered = false;
  const resources = [
    { name: "squirtle", url: "https://pokeapi.example/api/v2/pokemon/7/" },
    { name: "wartortle", url: "https://pokeapi.example/api/v2/pokemon/8/" },
    { name: "blastoise", url: "https://pokeapi.example/api/v2/pokemon/9/" },
  ];
  const harness = createHarness({
    existing: [{ id: 7, name: "squirtle", isDefault: true, data: { name: "squirtle" } }],
    pages: [0, 1].map(() => ({ count: 3, next: null, results: resources })),
    details: (url) => {
      detailCalls.set(url, (detailCalls.get(url) || 0) + 1);
      if (url.endsWith("/8/") && !recovered) return new Error("temporary upstream failure");
      const id = Number(url.match(/\/(\d+)\/$/)[1]);
      const name = resources.find((resource) => resource.url === url).name;
      return { id, name, is_default: true };
    },
    options: { failedSyncRetryMs: 1000 },
  });

  const first = await harness.syncPokemonCatalog({ force: true });
  assert.equal(first.status, "partial");
  assert.equal(first.failedCount, 1);
  assert.equal(harness.rows.has(9), true);
  assert.equal(harness.rows.has(8), false);
  assert.equal(harness.rows.has(7), true);

  // A later attempt sees id 8 is still missing and can persist it after recovery.
  recovered = true;
  harness.advanceTime(1001);
  const second = await harness.syncPokemonCatalog();
  assert.equal(second.status, "complete");
  assert.equal(harness.rows.has(8), true);
  assert.equal(detailCalls.get("https://pokeapi.example/api/v2/pokemon/8/"), 2);
});

test("shares one active synchronization across concurrent callers", async () => {
  let releasePage;
  let listCalls = 0;
  const pendingPage = new Promise((resolve) => { releasePage = resolve; });
  const rows = new Map();
  const http = {
    get: async () => {
      listCalls += 1;
      return pendingPage;
    },
  };
  const sync = createPokemonCatalogSync({
    catalogPokemon: {
      findAll: async () => [],
      bulkCreate: async () => {},
      count: async () => rows.size,
    },
    syncState: { findByPk: async () => null, upsert: async () => {} },
    sequelize: { transaction: async (callback) => callback({}) },
    http,
    apiUrl: "https://pokeapi.example/api/v2",
    logger: { log: () => {}, error: () => {} },
    retries: 0,
  });

  const first = sync.syncPokemonCatalog({ force: true });
  const second = sync.syncPokemonCatalog({ force: true });
  assert.equal(first, second);

  releasePage({ data: { count: 0, next: null, results: [] } });
  await Promise.all([first, second]);
  assert.equal(listCalls, 1);
  assert.equal(rows.size, 0);
});

test("keeps persisted catalog rows when PokeAPI discovery is unavailable", async () => {
  const harness = createHarness({
    existing: [{ id: 4, name: "charmander", isDefault: true, data: { name: "charmander" } }],
    pages: [],
  });
  const unavailableHttp = {
    get: async () => { throw new Error("PokeAPI unavailable"); },
  };
  const sync = createPokemonCatalogSync({
    catalogPokemon: {
      findAll: async () => [...harness.rows.values()],
      bulkCreate: async () => { throw new Error("no rows should be inserted"); },
      count: async () => harness.rows.size,
    },
    syncState: {
      findByPk: async (id) => harness.state.get(id) || null,
      upsert: async (row) => harness.state.set(row.id, row),
    },
    sequelize: { transaction: async (callback) => callback({}) },
    http: unavailableHttp,
    apiUrl: "https://pokeapi.example/api/v2",
    logger: { log: () => {}, error: () => {} },
    retries: 0,
  });

  const result = await sync.syncPokemonCatalog({ force: true });
  assert.equal(result.status, "error");
  assert.deepEqual([...harness.rows.keys()], [4]);
  assert.equal(harness.state.get(1).status, "error");
});

test("GET /pokemon returns a database-paginated catalog and applies validated server filters", async (t) => {
  const originalMethods = {
    catalogCount: CatalogPokemon.count,
    syncFindByPk: PokemonCatalogSync.findByPk,
    query: conn.query,
  };
  const originalAxiosGet = axios.get;
  const apiCalls = [];
  const queryCalls = [];
  conn.query = async (sql, options) => {
    queryCalls.push({ sql, options });
    const { limit, offset } = options.bind;
    const data = Array.from({ length: Math.min(limit, 250 - offset) }, (_, index) => ({
      id: String(offset + index + 1),
      name: `pokemon-${offset + index + 1}`,
      types: ["electric"],
      created: false,
    }));
    return [{ total: "250", data }];
  };
  axios.get = async (...args) => {
    apiCalls.push(args[0]);
    throw new Error("GET /pokemon should not fetch remote details");
  };
  CatalogPokemon.count = async () => 1;
  PokemonCatalogSync.findByPk = async () => ({
    status: "complete",
    lastAttemptAt: new Date(),
    lastSuccessfulAt: new Date(),
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    CatalogPokemon.count = originalMethods.catalogCount;
    PokemonCatalogSync.findByPk = originalMethods.syncFindByPk;
    conn.query = originalMethods.query;
    axios.get = originalAxiosGet;
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const firstResponse = await fetch(`${baseUrl}/pokemon`);
  const firstPage = await firstResponse.json();
  const secondResponse = await fetch(`${baseUrl}/pokemon?page=2&limit=20&name=pika&type=electric&origin=api&sortAttack=attack-desc`);
  const secondPage = await secondResponse.json();
  const hundredResponse = await fetch(`${baseUrl}/pokemon?page=1&limit=100`);
  const hundredPage = await hundredResponse.json();
  const cappedResponse = await fetch(`${baseUrl}/pokemon?limit=9999`);
  const cappedPage = await cappedResponse.json();
  const invalidResponse = await fetch(`${baseUrl}/pokemon?page=0`);

  assert.equal(firstResponse.status, 200);
  assert.equal(firstPage.pagination.page, 1);
  assert.equal(firstPage.pagination.limit, 20);
  assert.equal(firstPage.pagination.total, 250);
  assert.equal(firstPage.pagination.totalPages, 13);
  assert.equal(firstPage.data.length, 20);
  assert.deepEqual(firstPage.data[0], {
    id: "1", name: "pokemon-1", types: ["electric"], created: false,
  });
  assert.ok(Array.isArray(firstPage.data));
  assert.equal(secondResponse.status, 200);
  assert.equal(secondPage.pagination.page, 2);
  assert.equal(secondPage.data.length, 20);
  assert.equal(secondPage.pagination.limit, 20);
  assert.equal(secondPage.pagination.total, 250);
  assert.equal(secondPage.pagination.totalPages, 13);
  assert.equal(queryCalls[1].options.bind.offset, 20);
  assert.equal(queryCalls[1].options.bind.name, "pika");
  assert.deepEqual(queryCalls[1].options.bind.types, ["electric"]);
  assert.equal(queryCalls[1].options.bind.origin, false);
  assert.match(queryCalls[1].sql, /LIMIT \$limit OFFSET \$offset/);
  assert.match(queryCalls[1].sql, /types @> \$types::text\[\]/);
  assert.equal(hundredResponse.status, 200);
  assert.equal(hundredPage.data.length, 100);
  assert.equal(hundredPage.pagination.page, 1);
  assert.equal(hundredPage.pagination.limit, 100);
  assert.equal(hundredPage.pagination.total, 250);
  assert.equal(hundredPage.pagination.totalPages, 3);
  assert.equal(cappedPage.pagination.limit, 100);
  assert.equal(cappedResponse.status, 200);
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(apiCalls, []);
});

test("POST /pokemon/post stores an optional shiny image and still accepts it when omitted", async (t) => {
  const originalMethods = {
    pokemonCreate: Pokemon.create,
    pokemonFindByPk: Pokemon.findByPk,
    typeCount: Type.count,
  };
  const createdRows = [];
  let nextId = 1;
  Pokemon.create = async (attributes) => {
    const row = { id: `created-${nextId++}`, ...attributes };
    createdRows.push(row);
    return { id: row.id, addTypes: async () => {} };
  };
  Pokemon.findByPk = async (id) => createdRows.find((row) => row.id === id);
  Type.count = async ({ where }) => where.id.length;

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    Pokemon.create = originalMethods.pokemonCreate;
    Pokemon.findByPk = originalMethods.pokemonFindByPk;
    Type.count = originalMethods.typeCount;
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const pokemonInput = {
    name: "shiny-testmon",
    height: 10,
    weight: 10,
    hp: 10,
    image: "data:image/jpeg;base64,bm9ybWFs",
    attack: 10,
    defense: 10,
    speed: 10,
    types: [1],
  };
  const shinyResponse = await fetch(`${baseUrl}/pokemon/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...pokemonInput, shinyImage: "data:image/jpeg;base64,c2hpbnk=" }),
  });
  const normalOnlyResponse = await fetch(`${baseUrl}/pokemon/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pokemonInput),
  });
  const invalidShinyResponse = await fetch(`${baseUrl}/pokemon/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...pokemonInput, shinyImage: "not-an-image" }),
  });

  assert.equal(shinyResponse.status, 200);
  assert.equal(normalOnlyResponse.status, 200);
  assert.equal(invalidShinyResponse.status, 400);
  assert.equal(createdRows[0].shinyImage, "data:image/jpeg;base64,c2hpbnk=");
  assert.equal(Object.prototype.hasOwnProperty.call(createdRows[1], "shinyImage"), false);
});
