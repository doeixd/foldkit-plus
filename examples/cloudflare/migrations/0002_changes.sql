-- How many writes `todos` has taken, kept by triggers, so every path that
-- writes it (a Remote mutation, a declared write, the journal's settle)
-- counts with no code of its own. The live source reads it first on each
-- tick and reads nothing more while it has not moved.
-- One statement per line: the local stack runs each line as a statement.
CREATE TABLE IF NOT EXISTS todo_changes (id INTEGER PRIMARY KEY CHECK (id = 1), count INTEGER NOT NULL);
INSERT OR IGNORE INTO todo_changes (id, count) VALUES (1, 0);
CREATE TRIGGER IF NOT EXISTS todos_inserted AFTER INSERT ON todos BEGIN UPDATE todo_changes SET count = count + 1 WHERE id = 1; END;
CREATE TRIGGER IF NOT EXISTS todos_updated AFTER UPDATE ON todos BEGIN UPDATE todo_changes SET count = count + 1 WHERE id = 1; END;
CREATE TRIGGER IF NOT EXISTS todos_deleted AFTER DELETE ON todos BEGIN UPDATE todo_changes SET count = count + 1 WHERE id = 1; END;
