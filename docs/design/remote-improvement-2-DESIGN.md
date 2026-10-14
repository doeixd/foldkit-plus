# A unified data architecture for Foldkit Plus

After looking more closely at the Entity, Remote, Drizzle, Sync, and Durable designs, I think the best approach is not to build a new ORM or simply add migrations to `Entity.define()`.

Instead, I'd build a shared, versioned domain contract that the existing packages can interpret.

The central idea:

Define the meaning of your data and operations once. Let each layer determine how to store, query, validate, replicate, migrate, or render them.

This fits Foldkit Plus's existing philosophy unusually well. `foldkit-entity` already describes domain structure without owning storage, while Remote, Drizzle, forms, and other packages interpret that description.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://foldkit-plus.pages.dev\&sz=32)

Foldkit Plus



There is, however, a crucial refinement: the domain contract should be independent of the database schema, and migrations should describe changes to that contract, not just changes to SQL tables.

## 1. The architecture I'd build

## Versioned domain contract

Effect Schema · Entity · Relations · Operations · Stable IDs · Evolution

Drizzle adapter

SQL tables, queries, migrations

Remote

Selections, cache, live updates

Sync + Durable

Journals, replicas, offline edits

Application

Messages, Model, Surface, forms

Schema evolution engine

Compatibility analysis · migration planning · deployment checks

I'd organize the design around five principles:

1. One domain contract, multiple interpreters. The database does not dictate the application's entire domain model, nor does the domain model dictate its physical storage.
2. Stable identities, not just field names. A rename should not look like deleting one field and adding an unrelated one.
3. Operations are first-class and versioned. An offline message from an older client matters just as much as an existing database row.
4. Migrations are coordinated, not centralized. Drizzle handles SQL migration execution; Foldkit handles the compatibility of application data and operations.
5. The normal path should require almost no configuration. Additional complexity should appear only when the developer introduces genuinely complex changes.

The biggest architectural payoff is that Foldkit could understand the impact of a change before a migration is executed.

## 2. Make Entity the semantic source of truth

I'd retain Effect Schema and the existing `foldkit-entity` declaration rather than creating a second schema DSL.

Here's what an evolved API might look like. This is a proposal, not the current API.

```
import { Schema } from "effect";
import { Entity } from "foldkit-entity";

const Project = Entity.define(
  "Project",
  Schema.Struct({
    id: Schema.UUID,
    title: Schema.String,
    status: Schema.Literals([
      "active",
      "archived",
    ]),
    ownerId: Schema.UUID,
  }),
).pipe(
  Entity.identity("id"),

  Entity.version(3),

  Entity.fields({
    title: {
      id: "project.name",
    },
  }),
);
```

Notice that `title` has a stable field identity of `project.name`.

That might look strange, but imagine the field was originally named `name` and later became `title`.

Its programmatic name changed. Its conceptual identity did not.

This gives us something extremely useful:

| Property         | What it identifies                      |
| ---------------- | --------------------------------------- |
| `Project`        | The domain entity                       |
| `project.name`   | The logical field across renames        |
| `title`          | The current TypeScript property         |
| `projects.title` | Its current SQL representation          |
| Version `3`      | A version of its public domain contract |

A stable field ID should be optional for ordinary applications and primarily relevant to schema evolution tooling. Initially, the framework could derive IDs and save them in a schema manifest, prompting only when a possible rename is ambiguous.

### Why this matters beyond migrations

Stable identities can connect several existing capabilities:

- Remote selections can track fields even when their names change.
- Form metadata can preserve user-facing configuration across renames.
- Operations can be recognized as equivalent across versions.
- Migration tooling can distinguish a rename from a delete-and-add.
- Sync can determine which old journal entries are still meaningful.

However, stable IDs alone aren't sufficient. A changed field type, altered validation rule, or different business meaning may require an explicit transformation, even if the ID is unchanged.

## 3. Keep storage bindings separate

Here I would be careful not to overcorrect.

Foldkit Plus already has a Drizzle-first shortcut that derives an entity schema directly from the database table, and a separate path for binding an existing `foldkit-entity` domain. Both are useful.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://foldkit-plus.pages.dev\&sz=32)

Foldkit Plus



I would preserve both approaches:

Simple mode: Start with a Drizzle table, derive your Entity, and use Drizzle Kit migrations.

Domain-first mode: Define your Entity independently, attach storage adapters, and coordinate domain evolution across the rest of the application.

An illustrative domain-first binding:

```
const ProjectStorage = Drizzle.bind(Project, {
  table: projects,

  fields: {
    id: projects.id,
    title: projects.name,
    status: projects.status,
    ownerId: projects.owner_id,
  },
});
```

The important detail: the domain property `title` does not have to correspond to the SQL column `title`.

Maybe the SQL column is still called `name` because renaming it is unnecessary or because old application versions must continue using it.

That flexibility makes rolling migrations considerably easier.

It also preserves portability. The same Entity could eventually be interpreted by a SQLite adapter, a Postgres adapter, an in-memory adapter, or a native application.

I would not automatically generate all Drizzle tables from Effect Schema. Database types, indexes, constraints, generated columns, locking behavior, and relations contain physical design decisions that are not generally recoverable from a domain schema.

Instead, build tooling to detect drift between the Entity and its storage binding, generate suggestions, and delegate SQL migrations to Drizzle Kit. Drizzle already generates migration files by comparing schema snapshots.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://orm.drizzle.team\&sz=32)

\`generate\`



## 4. Version operations, not just entities

This is probably the most important part.

Consider an offline user editing a project with an older version of your application.

The old client sends:

```
RenameProject({
  id: "123",
  name: "Apollo",
})
```

But the new application expects:

```
RenameProject({
  id: "123",
  title: "Apollo",
})
```

The SQL migration could succeed perfectly, yet the user would still lose the ability to submit that offline operation if the server only understands the new message.

So I would make operations first-class schema-evolution participants.

```
const RenameProject = Operation.define(
  "RenameProject",
  {
    version: 2,

    input: Schema.Struct({
      id: Schema.UUID,
      title: Schema.String,
    }),

    writes: Project.select({
      title: true,
    }),
  },
);
```

Then the migration:

```
const RenameV1ToV2 = Evolution.operation(
  RenameProject,
  {
    from: 1,
    to: 2,

    migrate: old => ({
      id: old.id,
      title: old.name,
    }),
  },
);
```

This is more powerful than just migrating JSON snapshots.

An operation contract can describe the set of domain fields it may write. The schema-evolution engine can then determine whether an old operation remains compatible, needs translation, or must be rejected.

The server would decode the old wire format, translate it into a supported canonical operation, validate it, authorize it, and execute it.

For durable replicated operations, this translation must also preserve the intended state-transition semantics. Renaming a property is easy; changing a `toggle` operation into a `set` operation, for example, can change behavior under concurrent edits.

### One critical design constraint

Do not make every Foldkit `Message` a durable, remotely versioned operation.

Most Messages are local UI events. `OpenedModal`, `ChangedFilter`, or `HoveredRow` should not enter the database migration system.

Only explicitly durable or remote operations need this machinery.

This respects the existing division of responsibility between Remote and Sync rather than merging them into one complicated subsystem.

## 5. Introduce an Evolution layer, not a new ORM

I would add a small foundational package, provisionally called `foldkit-evolution`.

Its job is to understand change across versions.

It should not perform arbitrary SQL operations, own network connections, or mutate the application Model.

Its inputs would be versioned descriptors:

- Entity schemas and their stable identities
- Operation schemas and durable Message codecs
- Storage bindings
- Explicit transformation rules
- The previous published contract manifest

Its outputs would be a compatibility report and a migration plan.

### The developer experience

Suppose you rename `Project.name` to `Project.title`.

You update the Entity schema and its storage binding, then run:

```
pnpm foldkit-plus evolve
```

The tool compares the new contract against the previous published version and produces something like:

Project schema evolution

Review required

Detected change

v2 → v3

Rename detected

`Project.name` → `Project.title`

Stable field identity preserved

SQL binding

Existing column mapping remains valid

Remote cache

Invalidate old snapshots or transform

Offline operations

RenameProject v1 needs an upcaster

Forms and selections

Two references require rebuilding

Live protocol

Older clients need compatibility support

This is where the system could become genuinely more useful than a conventional SQL migration tool.

Drizzle understands how tables changed. Foldkit could understand how the entire application contract changed.

### Make migrations typed transformations

For straightforward changes, generate suggested transformations.

For complicated changes, require explicit logic:

```
const ProjectV3 = Evolution.define(Project, {
  from: 2,
  to: 3,

  fields: {
    title: Evolution.rename("name"),
  },

  operations: [
    RenameV1ToV2,
  ],
});
```

A more complicated example might split a single field into multiple fields, combine fields, or introduce a required default.

Those transformations should be validated using Effect Schema.

Critically, the engine shouldn't promise to infer arbitrary semantic changes. If `price` changes from dollars to cents, knowing that both representations are numbers tells us almost nothing about how to migrate them.

## 6. Database migrations should be coordinated using expand–migrate–contract

Consider renaming an SQL column in production.

The dangerous implementation is to rename the column and deploy the new application immediately. Older running servers can break, even if the final database schema is correct.

Instead, the evolution planner should reason about deployment phases.

1. Expand

   Add the new SQL column while keeping the old one. Deploy code that can accommodate the transitional schema.
2. Backfill

   Copy existing data into the new representation and verify the result. Use database transactions or resumable batches as appropriate.
3. Transition

   Deploy application code that reads the new representation. Ensure writes remain consistent across the rollout, using a deliberate dual-write, trigger, or other transition strategy.
4. Retire compatibility

   After older application instances and supported client versions are no longer dependent on the old representation, remove the compatibility behavior.
5. Contract

   Remove the obsolete column with a later reviewed migration.

The framework should generate a plan and verify the preconditions for each phase, not silently execute destructive migrations.

For a solo developer on SQLite, a simple direct migration may be enough. For a distributed production deployment, this process is much more important.

The system should distinguish the two.

### An important distinction: version numbers

I would avoid a single global integer called `schemaVersion`.

There are several independent timelines:

| Version            | Example                  |
| ------------------ | ------------------------ |
| Domain contract    | `Project` v3             |
| Operation protocol | `RenameProject` v2       |
| SQL database       | Drizzle migration `0042` |
| Offline journal    | Journal encoding v4      |
| Cache snapshot     | Remote cache format v2   |
| Server release     | Deployment `2026.10.13`  |

These cannot safely be assumed to advance together.

Instead, produce a manifest recording compatible versions and supported migrations. A server can then advertise which protocol versions it accepts, while the deployment system checks that its database has the required migrations.

## 7. Combine Remote and Sync through a transactionally consistent change stream

This is the second major architectural opportunity.

Foldkit Plus already documents a particularly interesting design for large datasets: keep the main database table as Remote's read model, use Sync's journal for durable offline edits, and overlay pending edits onto fetched rows.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://foldkit-plus.pages.dev\&sz=32)

Foldkit Plus



I would turn that into a reusable pattern.

The key is to distinguish three concepts:

Command

A request to change domain data

Transaction

Validate, authorize, apply write, record changes

Remote

Updated server facts

Sync

Acknowledged durable operations

### The key invariant

A successful database write and its corresponding committed change record must not disagree.

Where supported, perform the domain write and insert a change record into a transactional outbox within the same database transaction.

A background dispatcher can publish those committed changes to Remote subscribers. If the dispatcher crashes, it resumes from the outbox.

For Sync operations, preserve the durable journal's ordering, idempotency, and conflict-resolution rules. Do not treat the Remote change stream as an interchangeable replacement for that journal.

An illustrative transaction:

```
const result = yield* db.transaction(
  Effect.gen(function* () {
    const project = yield* updateProject(input);

    yield* outbox.append({
      entity: "Project",
      id: project.id,
      changedFields: ["title"],
      revision: project.revision,
    });

    return project;
  }),
);
```

This is conceptual API, but it demonstrates the boundary.

The outbox supplies information about what committed. Remote decides which cached entities and queries need refreshing. Sync separately acknowledges or rebases durable operations.

### What can be automatic?

Quite a lot.

When updating a project's title, the framework may know:

- Which entity instance changed
- Which specific fields were modified
- Which normalized records need patching
- Which queries depend on those fields
- Which views have active subscriptions

It can use that information to avoid unnecessarily refetching entire result sets.

But it cannot always know whether a row now belongs in a query whose membership depends on external, server-only, or non-deterministic conditions.

So I'd make the change planner conservative:

If it can prove a local update is correct, apply it. Otherwise invalidate and refetch.

That yields reliable behavior without sacrificing the benefits of schema-aware invalidation.

## 8. One additional improvement: make database capabilities explicit

Rather than making Drizzle essential to the architecture, the framework should define the capabilities it needs.

For example:

```
interface StorageAdapter {
  readonly read: ReadCapability;
  readonly write: WriteCapability;
  readonly transaction?: TransactionCapability;
  readonly changes?: ChangeFeedCapability;
  readonly schema?: SchemaInspectionCapability;
}
```

These are illustrative interfaces, not final Effect APIs. A production design should expose them as Effect services and use typed errors and requirements.

An in-memory implementation might offer read, write, and transactions. A Postgres implementation might add change feeds. SQLite could offer transactional changes but require a separate distribution mechanism.

This avoids tying the entire architecture to the lowest common denominator.

It is also synergistic with the native and cross-platform direction: the application-level contract doesn't care whether the storage interpreter is JavaScript, Rust, or something else.

## 9. What I would actually build, in order

I wouldn't implement the whole vision simultaneously.

Phase 1 — Contract manifests and drift analysis

Extract stable, serializable descriptions of Entities, operations, and bindings. Compare them across versions. Identify incompatible changes and produce useful diagnostics.

This provides immediate value without changing runtime behavior.

Phase 2 — Operation and journal evolution

Add versioned operation codecs and explicit, composable migration functions. Test decoding and replaying old journals under new application versions.

I would prioritize this over SQL generation because losing offline edits is the more serious unsolved problem.

Phase 3 — Drizzle migration integration

Compare domain contracts with storage schemas, detect mismatches, and generate reviewed migration plans. Reuse Drizzle Kit rather than replacing its SQL generation and execution facilities.

Phase 4 — Transactional changes and live queries

Introduce a standard committed-change envelope, optional outbox adapters, and automatic Remote invalidation. Connect this to Sync without violating its journal ownership or ordering guarantees.

Phase 5 — Production compatibility tooling

Build rollout validation, old-client simulation, migration checks, snapshot compatibility, and automated failure testing.

### What I would deliberately avoid

Several tempting approaches would make the architecture worse:

- A universal schema DSL: It would duplicate both Effect Schema and Drizzle, and likely be less capable than either.
- Automatic SQL from every Entity: Not every Entity is stored in one table, and storage layouts shouldn't dictate domain modeling.
- Full event sourcing as the default: Most CRUD applications don't need a permanent history of every domain mutation. Make durable journaling opt-in.
- Migrating every cache: Remote snapshots are disposable. Refetching is often safer and cheaper.
- Automatic semantic migrations: Renames and mechanical structural transformations are approachable; changing business meaning requires explicit developer intent.
- Persisting every Message: Foldkit's local application Messages and durable server operations serve different purposes.

## 10. The most synergistic end state

Imagine defining a `Product` domain once.

From that contract, Foldkit Plus can provide a typed selection API, a form, a CRUD interface, a data grid, schema-validated agent tools, server authorization, a normalized cache, and a Drizzle binding.

You then change `Product.price` from a floating-point dollar amount to an integer number of cents.

The system recognizes that this is a potentially breaking semantic change.

It identifies affected database columns, forms, selections, mutations, persisted cache snapshots, offline operations, and agent tool schemas.

It can offer a reviewed SQL migration, require a conversion function where necessary, validate that old durable operations remain interpretable, and check that the new deployment can safely coexist with supported old clients.

All without requiring each package to invent its own migration strategy.

That is the real opportunity.

Not one schema that magically handles everything, but one semantic contract whose evolution is understood across everything.

And it fits the existing Foldkit Plus philosophy: the Entity describes, the adapters interpret, the application owns its Model, and effects occur at explicit boundaries.

If I had to reduce the proposed work to one architectural decision, it would be this:

Introduce stable, versioned domain and operation identities beneath Entity, Remote, and Sync, and build evolution tooling around those identities.

That provides the foundation for migrations, compatibility, better invalidation, portability, and potentially much stronger tooling—without turning Foldkit Plus into an ORM or collapsing its existing abstractions.