-- Optional manual migration; the existing Sequelize startup sync also adds this nullable column.
ALTER TABLE "Pokemons"
ADD COLUMN IF NOT EXISTS "shinyImage" TEXT NULL;
