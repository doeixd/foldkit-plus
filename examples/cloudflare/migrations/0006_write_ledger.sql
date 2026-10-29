-- The todos writer's ledger (`ledger` in src/schema.ts): each write it landed,
-- by who asked, the operation and the row, so a write sent again is answered
-- with its row. test/migrations.test.ts holds this file to the Drizzle table.
-- One statement per line: the local stack runs each line as a statement.
create table if not exists "write_ledger" ("scope" text not null, "operation" text not null, "target" text not null, "answer" text not null, "at" integer not null, "request" text, primary key ("scope", "operation", "target"));
create index if not exists "write_ledger_at" on "write_ledger" ("at");
