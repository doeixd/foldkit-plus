-- The notes. The CHECKs are compiled from the Entity's rules
-- (`checkConstraints`), the revision trigger is `revisionTrigger`, and the row
-- log `pollLive` reads is `rowChangeLog`: test/migrations.test.ts holds this
-- file to what each returns, so no rule is written here by hand.
create table if not exists "notes" ("id" text primary key not null, "author_id" text not null, "title" text not null, "body" text not null, "created_at" integer not null, "revision" integer not null default 0, foreign key ("author_id") references "accounts" ("id"), constraint "notes_title_check" check (length("notes"."title") >= 1 and length("notes"."title") <= 120), constraint "notes_body_check" check (length("notes"."body") <= 2000));
create trigger if not exists "notes_revision_moves" after update on "notes" for each row when new."revision" = old."revision"
begin update "notes" set "revision" = old."revision" + 1 where "id" = new."id"; end;
create table if not exists "notes_row_changes" (seq integer primary key autoincrement, id text not null);
create trigger if not exists "notes_logged_insert" after insert on "notes" begin insert into "notes_row_changes" (id) values (new."id"); end;
create trigger if not exists "notes_logged_update" after update on "notes" begin insert into "notes_row_changes" (id) values (new."id"); end;
create trigger if not exists "notes_logged_delete" after delete on "notes" begin insert into "notes_row_changes" (id) values (old."id"); end;
create trigger if not exists "notes_row_changes_trimmed" after insert on "notes_row_changes" begin delete from "notes_row_changes" where seq <= new.seq - 1000; end;
