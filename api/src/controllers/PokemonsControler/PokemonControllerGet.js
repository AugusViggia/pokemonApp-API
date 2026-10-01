const { QueryTypes } = require("sequelize");
const { Pokemon, Type, CatalogPokemon, conn } = require("../../db");
const { ensurePokemonCatalog } = require("../../services/pokeApiService");

const quoteIdentifier = (value) => conn.getQueryInterface().queryGenerator.quoteIdentifier(value);
const quoteTable = (model) => conn.getQueryInterface().queryGenerator.quoteTable(model.getTableName());
const columnName = (model, attribute) => model.rawAttributes[attribute]?.field || attribute;
const column = (model, attribute, alias) =>
    `${alias}.${quoteIdentifier(columnName(model, attribute))}`;

const getOrderSql = ({ sortName = "all", sortAttack = "all" }) => {
    const order = [];

    if (sortName === "name-asc") order.push('name COLLATE "C" ASC');
    if (sortName === "name-desc") order.push('name COLLATE "C" DESC');

    if (sortAttack === "attack-asc") {
        order.push("CASE WHEN attack ~ '^[0-9]+([.][0-9]+)?$' THEN attack::numeric END ASC NULLS LAST");
    }
    if (sortAttack === "attack-desc") {
        order.push("CASE WHEN attack ~ '^[0-9]+([.][0-9]+)?$' THEN attack::numeric END DESC NULLS LAST");
    }

    if (!order.length) {
        order.push("created DESC", "catalog_id ASC NULLS LAST", "name ASC");
    } else {
        order.push("created DESC", "catalog_id ASC NULLS LAST");
    }
    order.push("id ASC");
    return order.join(", ");
};

const getPaginatedPokemons = async ({
    page,
    limit,
    name = null,
    types = [],
    origin = null,
    sortName = "all",
    sortAttack = "all",
}) => {
    await ensurePokemonCatalog();

    const typeAssociation = Pokemon.associations.types;
    const throughModel = typeAssociation.through.model;
    const pokemonTable = quoteTable(Pokemon);
    const typeTable = quoteTable(Type);
    const catalogTable = quoteTable(CatalogPokemon);
    const throughTable = quoteTable(throughModel);
    const pokemonId = column(Pokemon, Pokemon.primaryKeyAttribute, "p");
    const typeId = column(Type, Type.primaryKeyAttribute, "t");
    const pokemonForeignKey = quoteIdentifier(columnName(throughModel, typeAssociation.foreignKey));
    const typeForeignKey = quoteIdentifier(columnName(throughModel, typeAssociation.otherKey));
    const typeName = column(Type, "name", "t");

    const orderSql = getOrderSql({ sortName, sortAttack });
    const sql = `
        WITH combined AS (
            SELECT
                ${pokemonId}::text AS id,
                ${column(Pokemon, "name", "p")}::text AS name,
                ${column(Pokemon, "height", "p")}::text AS height,
                ${column(Pokemon, "weight", "p")}::text AS weight,
                ${column(Pokemon, "hp", "p")}::text AS hp,
                ${column(Pokemon, "image", "p")}::text AS image,
                ${column(Pokemon, "image", "p")}::text AS normal_image,
                NULL::text AS shiny_image,
                ${column(Pokemon, "attack", "p")}::text AS attack,
                ${column(Pokemon, "defense", "p")}::text AS defense,
                ${column(Pokemon, "speed", "p")}::text AS speed,
                COALESCE(
                ARRAY_AGG(DISTINCT ${typeName}::text) FILTER (WHERE ${typeId} IS NOT NULL),
                    ARRAY[]::text[]
                ) AS types,
                TRUE AS created,
                NULL::integer AS catalog_id
            FROM ${pokemonTable} AS p
            LEFT JOIN ${throughTable} AS pt
                ON pt.${pokemonForeignKey} = ${pokemonId}
            LEFT JOIN ${typeTable} AS t
                ON ${typeId} = pt.${typeForeignKey}
            GROUP BY ${pokemonId}

            UNION ALL

            SELECT
                ${column(CatalogPokemon, "id", "cp")}::text AS id,
                ${column(CatalogPokemon, "name", "cp")}::text AS name,
                ${column(CatalogPokemon, "data", "cp")} #>> '{height}' AS height,
                ${column(CatalogPokemon, "data", "cp")} #>> '{weight}' AS weight,
                COALESCE(${column(CatalogPokemon, "data", "cp")} #>> '{stats,0,base_stat}', '0') AS hp,
                COALESCE(
                    ${column(CatalogPokemon, "data", "cp")} #>> '{sprites,other,home,front_default}',
                    ${column(CatalogPokemon, "data", "cp")} #>> '{sprites,other,dream_world,front_default}'
                ) AS image,
                COALESCE(
                    ${column(CatalogPokemon, "data", "cp")} #>> '{sprites,other,home,front_default}',
                    ${column(CatalogPokemon, "data", "cp")} #>> '{sprites,other,dream_world,front_default}'
                ) AS normal_image,
                COALESCE(
                    ${column(CatalogPokemon, "data", "cp")} #>> '{sprites,other,home,front_shiny}',
                    ${column(CatalogPokemon, "data", "cp")} #>> '{sprites,front_shiny}'
                ) AS shiny_image,
                COALESCE(${column(CatalogPokemon, "data", "cp")} #>> '{stats,1,base_stat}', '0') AS attack,
                COALESCE(${column(CatalogPokemon, "data", "cp")} #>> '{stats,2,base_stat}', '0') AS defense,
                COALESCE(${column(CatalogPokemon, "data", "cp")} #>> '{stats,5,base_stat}', '0') AS speed,
                ARRAY(
                    SELECT type_data.value #>> '{type,name}'
                    FROM jsonb_array_elements(
                        COALESCE(${column(CatalogPokemon, "data", "cp")} -> 'types', '[]'::jsonb)
                    ) AS type_data(value)
                ) AS types,
                FALSE AS created,
                ${column(CatalogPokemon, "id", "cp")}::integer AS catalog_id
            FROM ${catalogTable} AS cp
            WHERE ${column(CatalogPokemon, "isDefault", "cp")} = TRUE
        ),
        filtered AS (
            SELECT * FROM combined
            WHERE ($name::text IS NULL OR name ILIKE '%' || $name || '%')
              AND ($origin::boolean IS NULL OR created = $origin::boolean)
              AND (cardinality($types::text[]) = 0 OR types @> $types::text[])
        ),
        page_rows AS (
            SELECT * FROM filtered
            ORDER BY ${orderSql}
            LIMIT $limit OFFSET $offset
        )
        SELECT
            (SELECT COUNT(*)::integer FROM filtered) AS total,
            COALESCE(
                (
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', id,
                            'name', name,
                            'height', height,
                            'weight', weight,
                            'hp', hp,
                            'image', image,
                            'normalImage', normal_image,
                            'shinyImage', shiny_image,
                            'attack', attack,
                            'defense', defense,
                            'speed', speed,
                            'types', types,
                            'created', created
                        ) ORDER BY ${orderSql}
                    )
                    FROM page_rows
                ),
                '[]'::jsonb
            ) AS data
    `;

    const [result] = await conn.query(sql, {
        bind: {
            name,
            types,
            origin,
            limit,
            offset: (page - 1) * limit,
        },
        type: QueryTypes.SELECT,
    });

    const data = Array.isArray(result.data)
        ? result.data
        : JSON.parse(result.data || "[]");
    const total = Number(result.total) || 0;

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
};

module.exports = {
    getPaginatedPokemons,
    getOrderSql,
};
