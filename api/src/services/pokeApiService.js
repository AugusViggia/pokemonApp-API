const axios = require("axios");
const { CatalogPokemon, PokemonCatalogSync, conn } = require("../db");

const SYNC_STATE_ID = 1;
const LIST_PAGE_SIZE = 100;
const DEFAULT_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 12000;
const RETRIES = 2;
const RETRY_DELAY_MS = 400;
const DEFAULT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FAILED_SYNC_RETRY_MS = 15 * 60 * 1000;
const BOOTSTRAP_WAIT_MS = 60 * 1000;
const SYNC_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const asNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const boundedNumber = (value, fallback, maximum) =>
  Math.min(asNumber(value, fallback), maximum);

const getResourceId = (url) => {
  const match = String(url).match(/\/pokemon\/(\d+)\/?(?:\?.*)?$/i);
  return match ? Number(match[1]) : null;
};

const getRowValue = (row, key) => row?.[key] ?? row?.dataValues?.[key];

const createPokemonCatalogSync = ({
  catalogPokemon = CatalogPokemon,
  syncState = PokemonCatalogSync,
  sequelize = conn,
  http = axios,
  apiUrl = process.env.API_URL,
  logger = console,
  now = () => new Date(),
  pageSize = boundedNumber(process.env.POKEMON_SYNC_PAGE_SIZE, LIST_PAGE_SIZE, 1000),
  concurrency = boundedNumber(process.env.POKEMON_SYNC_CONCURRENCY, DEFAULT_CONCURRENCY, 12),
  syncIntervalMs = asNumber(process.env.POKEMON_SYNC_INTERVAL_MS, DEFAULT_SYNC_INTERVAL_MS),
  failedSyncRetryMs = FAILED_SYNC_RETRY_MS,
  bootstrapWaitMs = asNumber(process.env.POKEMON_BOOTSTRAP_WAIT_MS, BOOTSTRAP_WAIT_MS),
  retries = RETRIES,
  retryDelayMs = RETRY_DELAY_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
} = {}) => {
  let activeSync = null;

  const requestWithRetry = async (url) => {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await http.get(url, { timeout: requestTimeoutMs });
        return response.data;
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 1));
        }
      }
    }

    throw lastError;
  };

  const getAllResources = async () => {
    if (!apiUrl) throw new Error("API_URL is required to synchronize Pokémon");

    const baseUrl = apiUrl.replace(/\/+$/, "");
    let pageUrl = `${baseUrl}/pokemon?limit=${pageSize}&offset=0`;
    const visitedPages = new Set();
    const resources = [];
    let total = null;

    while (pageUrl) {
      if (visitedPages.has(pageUrl)) {
        throw new Error("PokeAPI repeated a pagination URL during catalog sync");
      }
      visitedPages.add(pageUrl);

      const page = await requestWithRetry(pageUrl);
      if (total === null) total = Number(page.count) || 0;
      resources.push(...(Array.isArray(page.results) ? page.results : []));
      logger.log(`Pokemon sync discovery: ${resources.length}${total ? `/${total}` : ""} resources`);
      pageUrl = page.next || null;
    }

    return { resources, total: total ?? resources.length };
  };

  const isSyncDue = (state, timestamp = now()) => {
    if (!state) return true;
    const status = getRowValue(state, "status");
    const lastAttemptAt = getRowValue(state, "lastAttemptAt");
    const lastSuccessfulAt = getRowValue(state, "lastSuccessfulAt");

    if (status === "partial" || status === "error") {
      return !lastAttemptAt || timestamp.getTime() - new Date(lastAttemptAt).getTime() >= failedSyncRetryMs;
    }

    return !lastSuccessfulAt || timestamp.getTime() - new Date(lastSuccessfulAt).getTime() >= syncIntervalMs;
  };

  const saveSyncState = async (values) => {
    await syncState.upsert({ id: SYNC_STATE_ID, ...values });
  };

  const runSync = async ({ force = false } = {}) => {
    const startedAt = Date.now();
    const attemptedAt = now();
    let resourceCount = 0;
    let defaultPokemonCount = 0;
    let failedCount = 0;
    let savedCount = 0;

    try {
      const previousState = await syncState.findByPk(SYNC_STATE_ID);
      if (!force && !isSyncDue(previousState, attemptedAt)) {
        return { skipped: true, status: getRowValue(previousState, "status") };
      }

      logger.log("Pokemon sync started");
      await saveSyncState({
        status: "running",
        lastAttemptAt: attemptedAt,
        resourceCount: getRowValue(previousState, "resourceCount") || 0,
        defaultPokemonCount: getRowValue(previousState, "defaultPokemonCount") || 0,
        failedCount: 0,
      });

      const { resources, total } = await getAllResources();
      resourceCount = resources.length;
      logger.log(`PokeAPI total: ${total} resources discovered (${resourceCount} paged)`);

      const storedRows = await catalogPokemon.findAll({ attributes: ["id", "isDefault"] });
      const storedIds = new Set(storedRows.map((row) => Number(getRowValue(row, "id"))));
      const defaultStoredCount = storedRows.filter((row) => getRowValue(row, "isDefault") === true).length;
      const missing = resources.filter((resource) => {
        const id = getResourceId(resource.url);
        if (!id) {
          failedCount += 1;
          logger.error(`Unable to parse a Pokémon resource ID from ${resource.url}`);
          return false;
        }
        return !storedIds.has(id);
      });

      logger.log(`Database total: ${storedRows.length} resources (${defaultStoredCount} default Pokémon)`);
      logger.log(`New PokeAPI resources: ${missing.length}`);

      for (let offset = 0; offset < missing.length; offset += concurrency) {
        const batch = missing.slice(offset, offset + concurrency);
        const detailResults = await Promise.allSettled(
          batch.map((resource) => requestWithRetry(resource.url)),
        );
        const rows = [];

        detailResults.forEach((result, index) => {
          if (result.status !== "fulfilled") {
            failedCount += 1;
            logger.error(
              `Unable to sync Pokémon ${batch[index].name}: ${result.reason?.message || result.reason}`,
            );
            return;
          }

          rows.push({
            id: getResourceId(batch[index].url),
            name: result.value.name || batch[index].name,
            isDefault: result.value.is_default !== false,
            data: result.value,
            syncedAt: now(),
          });
        });

        if (rows.length) {
          try {
            await sequelize.transaction((transaction) =>
              catalogPokemon.bulkCreate(rows, {
                ignoreDuplicates: true,
                transaction,
              }),
            );
            savedCount += rows.length;
            defaultPokemonCount += rows.filter((row) => row.isDefault).length;
          } catch (error) {
            failedCount += rows.length;
            logger.error(`Unable to persist a Pokémon batch: ${error.message}`);
          }
        }

        const completed = Math.min(offset + batch.length, missing.length);
        if (completed === missing.length || completed % 100 < concurrency) {
          logger.log(`Pokemon sync progress: ${completed}/${missing.length} new resources processed`);
        }
      }

      const finishedAt = now();
      const status = failedCount > 0 ? "partial" : "complete";
      await saveSyncState({
        status,
        lastAttemptAt: attemptedAt,
        lastSuccessfulAt: failedCount === 0 ? finishedAt : getRowValue(previousState, "lastSuccessfulAt") || null,
        resourceCount,
        defaultPokemonCount: defaultStoredCount + defaultPokemonCount,
        failedCount,
      });

      logger.log(`New default Pokemon: ${defaultPokemonCount}`);
      logger.log(`Pokemon sync downloaded: ${savedCount} resources`);
      logger.log("Pokemon sync updated: 0 existing resources (persisted entries reused)");
      logger.log(`Pokemon sync errors: ${failedCount}`);
      logger.log(`Pokemon sync completed in ${Date.now() - startedAt} ms (${status})`);
      return { status, resourceCount, savedCount, failedCount };
    } catch (error) {
      failedCount += 1;
      logger.error(`Pokemon sync failed: ${error.message}`);
      try {
        await saveSyncState({
          status: "error",
          lastAttemptAt: attemptedAt,
          resourceCount,
          defaultPokemonCount,
          failedCount,
        });
      } catch (stateError) {
        logger.error(`Unable to save Pokémon sync state: ${stateError.message}`);
      }
      logger.log(`Pokemon sync completed in ${Date.now() - startedAt} ms (error)`);
      return { status: "error", error, resourceCount, failedCount };
    }
  };

  const syncPokemonCatalog = (options) => {
    if (activeSync) return activeSync;
    activeSync = runSync(options).finally(() => {
      activeSync = null;
    });
    return activeSync;
  };

  const ensurePokemonCatalog = async () => {
    const existingCount = await catalogPokemon.count();
    const syncTask = syncPokemonCatalog();

    if (existingCount > 0) {
      // Keep serving the persisted catalog while an overdue refresh runs.
      syncTask.catch((error) => logger.error(`Pokemon sync failed: ${error.message}`));
      return { waiting: false };
    }

    let timeoutId;
    const timedOut = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ timedOut: true }), bootstrapWaitMs);
    });
    const result = await Promise.race([syncTask, timedOut]);
    clearTimeout(timeoutId);
    if (result?.timedOut) logger.error(`Pokemon bootstrap wait reached ${bootstrapWaitMs} ms; serving saved rows`);
    return { waiting: true, result };
  };

  return { syncPokemonCatalog, ensurePokemonCatalog, getAllResources, isSyncDue };
};

const pokemonCatalogSync = createPokemonCatalogSync();

const schedulePokemonCatalogSync = () => {
  pokemonCatalogSync.syncPokemonCatalog().catch((error) => {
    console.error(`Pokemon sync scheduler failed: ${error.message}`);
  });
};

module.exports = {
  createPokemonCatalogSync,
  syncPokemonCatalog: pokemonCatalogSync.syncPokemonCatalog,
  ensurePokemonCatalog: pokemonCatalogSync.ensurePokemonCatalog,
  schedulePokemonCatalogSync,
  SYNC_CHECK_INTERVAL_MS,
};
