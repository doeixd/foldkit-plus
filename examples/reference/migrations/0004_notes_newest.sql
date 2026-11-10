-- The order of `Notes` (src/server.ts): newest first, ties by id, so a page
-- is read in order from the index rather than sorted. test/migrations.test.ts
-- holds this file to the Drizzle table.
create index if not exists "notes_newest" on "notes" ("created_at" desc, "id");
