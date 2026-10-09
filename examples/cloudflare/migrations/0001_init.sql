-- The entity tables. The journal tables (`documents`, `operations`,
-- `effects`, `epochs`, `replicas`, `durable_meta`) are created by
-- `foldkit-durable` itself on first open.
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
