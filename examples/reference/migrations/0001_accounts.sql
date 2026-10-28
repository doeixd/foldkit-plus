-- Who may sign in. `accounts` is the application's own row per member, which
-- Yielded's password registration inserts (`Provisioning` in src/auth.ts) in
-- the same D1 batch as the email and the password. The `auth_*` tables are
-- Yielded's own, as `Persistence.managed({ prefix: 'auth' })` declares them.
-- test/migrations.test.ts holds every statement here to that declaration.
create table if not exists "accounts" ("id" text primary key not null, "status" text not null, "security_revision" text not null, "email" text not null, "name" text not null);
create table if not exists "auth_identifiers" ("namespace" text not null, "value" text not null, "module_id" text, "credential_id" text, "subject_id" text not null, "revision" text not null, "verified_at" integer, "active" integer not null);
create unique index if not exists "auth_identifiers_key_0" on "auth_identifiers" ("namespace", "value");
create index if not exists "auth_identifiers_index_0" on "auth_identifiers" ("subject_id", "namespace", "value");
create table if not exists "auth_credentials" ("credential_id" text not null, "subject_id" text not null, "revision" text not null, "active" integer not null);
create unique index if not exists "auth_credentials_key_0" on "auth_credentials" ("credential_id");
create index if not exists "auth_credentials_index_0" on "auth_credentials" ("subject_id", "active", "credential_id");
create table if not exists "auth_sessions" ("session_id" text not null, "subject_id" text not null, "digest" text not null, "security_revision" text not null, "issued_at" integer not null, "expires_at" integer not null, "absolute_expires_at" integer not null, "record" text not null);
create unique index if not exists "auth_sessions_key_0" on "auth_sessions" ("session_id");
create unique index if not exists "auth_sessions_key_1" on "auth_sessions" ("digest");
create index if not exists "auth_sessions_index_0" on "auth_sessions" ("subject_id", "security_revision", "session_id");
create table if not exists "auth_pending" ("module_id" text not null, "kind" text not null, "digest" text not null, "version" text not null, "flow_id" text not null, "subject_id" text not null, "binding_digest" text not null, "snapshot" text not null, "expires_at" integer not null, "attempt_limit" integer not null, "failed_attempts" integer not null, "consumed" integer not null);
create unique index if not exists "auth_pending_key_0" on "auth_pending" ("digest");
create index if not exists "auth_pending_index_0" on "auth_pending" ("module_id", "expires_at", "digest");
create table if not exists "auth_passwords" ("module_id" text not null, "subject_id" text not null, "credential_id" text not null, "credential_revision" text not null, "verifier_version" text not null, "verifier" text not null, "normalization" text not null);
create unique index if not exists "auth_passwords_key_0" on "auth_passwords" ("module_id", "subject_id");
create unique index if not exists "auth_passwords_key_1" on "auth_passwords" ("module_id", "credential_id");
create table if not exists "auth_proofs" ("module_id" text not null, "purpose" text not null, "series_key" text not null, "proof_id" text not null, "binding" text not null, "verifier_key_id" text not null, "verifier_digest" text not null, "issued_at" integer not null, "expires_at" integer not null, "failed_attempts" integer not null);
create unique index if not exists "auth_proofs_key_0" on "auth_proofs" ("module_id", "purpose", "series_key");
create unique index if not exists "auth_proofs_key_1" on "auth_proofs" ("module_id", "proof_id");
