-- Which rows of `todos` each write touched, in order, kept by triggers, so
-- every path that writes it (a Remote mutation, a declared write, the
-- journal's settle) is logged with no code of its own. The live source asks
-- for what was logged after the last entry it read, and reads only those
-- rows. The last 1000 entries are kept; a source further behind reads
-- everything. It replaces the write count of 0002.
-- One statement per line: the local stack runs each line as a statement.
DROP TRIGGER IF EXISTS todos_inserted;
DROP TRIGGER IF EXISTS todos_updated;
DROP TRIGGER IF EXISTS todos_deleted;
DROP TABLE IF EXISTS todo_changes;
CREATE TABLE IF NOT EXISTS todo_row_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL);
CREATE TRIGGER IF NOT EXISTS todos_logged_insert AFTER INSERT ON todos BEGIN INSERT INTO todo_row_changes (id) VALUES (NEW.id); END;
CREATE TRIGGER IF NOT EXISTS todos_logged_update AFTER UPDATE ON todos BEGIN INSERT INTO todo_row_changes (id) VALUES (NEW.id); END;
CREATE TRIGGER IF NOT EXISTS todos_logged_delete AFTER DELETE ON todos BEGIN INSERT INTO todo_row_changes (id) VALUES (OLD.id); END;
CREATE TRIGGER IF NOT EXISTS todo_row_changes_trimmed AFTER INSERT ON todo_row_changes BEGIN DELETE FROM todo_row_changes WHERE seq <= NEW.seq - 1000; END;
