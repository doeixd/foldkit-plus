-- The notes writer's ledger (`ledger` in src/server.ts): each write it landed,
-- by who asked, the operation and the row, so a write sent again is answered
-- with its row. The index on `at` keeps pruning expired records from scanning
-- the table. test/migrations.test.ts holds this file to the Drizzle table.
create table if not exists "write_ledger" ("scope" text not null, "operation" text not null, "target" text not null, "answer" text not null, "at" integer not null, "request" text, primary key ("scope", "operation", "target"));
create index if not exists "write_ledger_at" on "write_ledger" ("at");
