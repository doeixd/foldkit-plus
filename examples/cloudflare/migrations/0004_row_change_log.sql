-- The row log of 0003, now kept by foldkit-remote-drizzle's rowChangeLog(Db.Todo):
-- its table is todos_row_changes, and its triggers keep the names 0003 gave,
-- so they are dropped first for these to replace them. test/migrations.test.ts
-- checks the statements after the drops are what rowChangeLog returns.
-- One statement per line: the local stack runs each line as a statement.
DROP TRIGGER IF EXISTS todos_logged_insert;
DROP TRIGGER IF EXISTS todos_logged_update;
DROP TRIGGER IF EXISTS todos_logged_delete;
DROP TRIGGER IF EXISTS todo_row_changes_trimmed;
DROP TABLE IF EXISTS todo_row_changes;
create table if not exists "todos_row_changes" (seq integer primary key autoincrement, id text not null);
create trigger if not exists "todos_logged_insert" after insert on "todos" begin insert into "todos_row_changes" (id) values (new."id"); end;
create trigger if not exists "todos_logged_update" after update on "todos" begin insert into "todos_row_changes" (id) values (new."id"); end;
create trigger if not exists "todos_logged_delete" after delete on "todos" begin insert into "todos_row_changes" (id) values (old."id"); end;
create trigger if not exists "todos_row_changes_trimmed" after insert on "todos_row_changes" begin delete from "todos_row_changes" where seq <= new.seq - 1000; end;
