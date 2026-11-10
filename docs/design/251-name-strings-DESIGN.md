# #251: the last member names given as strings

Status: decided and built (2026-11-09).

## The problem

A public option that names a field, relation, query or mutation as a plain
`string` compiles whatever it is given. A misspelling then fails at run time,
or silently. #251 was opened after Chirp re-read the wrong fields of a write's
answer, and nothing could catch it.

## What was already done

Before this note, checked against the code on 2026-11-09:

- **Derived bindings.** A count or exists the Entity declares
  (`Derived.count(Like.relations.post)`, `Derived.exists`) needs no binding
  entry. `bind`'s `derived` entry exists only for a member the interpreter
  supplies (`Derived.make`), and its `relation` is typed by the Entity's
  `many` keys (`CountDerived<ManyKeys<E>>`).
- **Re-reads.** A mutation's answer re-reads what the client shows of the
  rows it names, so no application lists fields.
- **Mutation input.** `RemoteServer.mutation`'s `run` receives typed input.
- **Revisions in declared writes.** `Write.expect` is typed
  `keyof Fields & string`, a key the compiler checks.
- **The guarded writer's revision.** `GuardServer.writer`'s `revision` is
  typed `keyof E['fields'] & string`. It is checked when the writer is made
  (the field exists and is stored as a number), and compared with each
  write's own `expect`.

## Decisions

1. **The defect is a name nothing checks, not the shape of a string.** A
   string option typed by the Entity's or binding's keys is checked by the
   compiler. Accepting a reference object (`Post.fields.revision`) beside it
   would add a second way to say the same thing and check nothing more.
   Typed keys stay.
2. **The revision stays on the writer.** Declaring it on the Entity
   (`Entity.revision(field)`) and having writers read it was rejected.
   Whether a guarded writer pins a revision changes what it does: with one,
   every update lands only over the row its rules read. An Entity-level
   declaration would turn that on for writers that do not pin today, or it
   would need a per-writer opt-out, which is the option it replaced.
3. **Two plain strings were left, and both are now typed.**
   - `applyEdits`' `revision?: string` (`foldkit-remote-drizzle`) is now
     `keyof B['fields'] & string`, for the binding `B` it applies to.
   - `entity()`'s `computed: { x: { relation: string } }` now takes only a
     key of a `many` or `manyToMany` relation of the same binding
     (`CollectionKeys<Relations>`, as a constraint on the type parameter, so
     inference cannot fail open). Relations typed only as a record of any key
     (a helper building them generically) say nothing about their names, so
     any name passes there, as before.
   - `applyEdits`' type parameters keep `P` first, so an explicit
     `applyEdits<Principal>(…)` still compiles. The binding's type is then
     the default, and any revision name passes.

   Both keep their checks at load time, which also refuse what a type cannot
   see (a field with no column).
4. **No lint.** A search of the published sources for options typed `string`
   that name members found mostly output records (`{ key: string }` in
   results), not inputs. A check would be noise. The rule goes in
   `AGENTS.md`'s design list instead, where review applies it.
5. **The `examples/entity` count stays as it is.** It counts comments with
   `Derived.make` plus a typed `derived` entry. Moving it to `Derived.count`
   would add a second descriptor (a derived member belongs to the Entity, not
   the descriptor) and change the example's tour. The entry is already
   typed, so it is not this issue's defect.

## Checks

- `packages/remote-drizzle/test/binding.test-d.ts` holds a negative case for
  each rule (a misspelt revision, a misspelt relation, a `one` relation). Each
  goes red (TS2578) when its constraint is widened back to `string`, checked
  by hand.
- `index.test.ts`'s runtime refusals are marked `@ts-expect-error`, so each is
  refused at both levels.
