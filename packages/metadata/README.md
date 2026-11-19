# `foldkit-metadata`

When one package builds a description (such as which Model fields a screen reads) and another package attaches requirements to it (such as which server queries those fields need), the carrier package cannot hardcode fields for every downstream consumer. Putting plain string properties on an object also risks name collisions between unrelated packages.

`foldkit-metadata` solves this by giving each consumer a private, typed key (`Metadata.key`). A carrier merges and forwards entries with `Metadata.combine` without knowing what they mean, and only code holding the original key object can read its entries back.

It also provides `Evidence`, which records why a declared transition keeps a law so `foldkit-entity` and `foldkit-surface` can share those records without depending on each other.

## When to write a Metadata key

Use `foldkit-metadata` when you are building a **carrier** (a description other packages decorate, such as a Surface `Projection`) or an **interpreter** (a package that attaches facts to someone else's description, such as `foldkit-remote` recording server data needs).

Applications rarely import this package directly. `foldkit-surface` re-exports `Metadata`, so an app using Surface already has it. Metadata describes static declarations at definition time; it lives outside your Foldkit Model and `update`.

- The **key** defines the entry type, how duplicates `merge`, and how an entry is `summarize`d as text.
- The **carrier** decides where metadata sits and merges parts with `Metadata.combine`, without inspecting entries.
- Lookup uses key object identity rather than the string `name`, so two packages picking the same name stay isolated.

## Install

```sh
pnpm add foldkit-metadata effect
```

## A first Metadata key

This declares a `Flags` key with a deduplicating `merge` rule, combines two metadata values, and reads back both the typed entries and their text summary:

```ts
import { Metadata } from 'foldkit-metadata'

// An interpreter declares its key once at module level.
const Flags = Metadata.key<string>('flags', {
  merge: flags => [...new Set(flags)],
  summarize: flag => flag,
})

// A carrier merges parts without knowing which keys are inside.
const combined = Metadata.combine([Flags.of('beta'), Flags.of('beta', 'gamma')])

Flags.get(combined) // ['beta', 'gamma']
Metadata.summarize(combined) // [{ name: 'flags', entries: ['beta', 'gamma'] }]
```

`Flags.of` and `Metadata.combine` construct immutable values and run `merge` eagerly, so `Flags.get(combined)` returns `['beta', 'gamma']` with `'beta'` deduplicated.

## Writing a merge rule

A carrier can combine parts that were already combined. Write `merge` to be associative so regrouping parts preserves the same result: a set union deduplicates repeated flags, whereas array concatenation keeps order and duplicates.

`Flags.get(Metadata.empty)` returns `[]`. Another key also named `'flags'` reads `[]` from `combined` because names only label `summarize` output while object identity controls lookup. Treat a key as an integration token rather than a security boundary against code that already holds that key reference.

`merge` and `summarize` are your own callbacks; if either throws, the exception propagates directly to the caller.

## Evidence

A law such as `Product.reservedWithinStock` is satisfied by a transition (`write:Sell`) when an `Evidence` record attests to it:

| Record | Issued by | When |
| --- | --- | --- |
| `Enumerated` | `Laws.check` (`foldkit-entity`) | Verified by enumerating the declared shapes |
| `Bounded` | `Laws.check` (`foldkit-entity`) | Proved from declared number bounds across all rows |
| `Walked` | `Walk.run` (`foldkit-remote/testing`) | Every seeded walk from every start passed |
| `Scenario` | `Scenario.run` (planned) | A multi-step scenario ran with no mismatch |
| `RuntimeOnly` | `Evidence.runtimeOnly` | Declared manually when only production enforces the law |

Because a record is plain data, each producer creates an issuer once and stamps every record it returns by object identity. A record built directly with `Evidence.Enumerated(...)` or copied via object spread carries no stamp, so a reader can reject it:

```ts
import { Option } from 'effect'
import { Evidence } from 'foldkit-metadata'

const line = Evidence.runtimeOnly({
  transition: 'write:Sell',
  law: 'Product.reservedWithinStock',
  why: 'only the writer reads stock and reserved together, where the sale commits',
})

Evidence.issuedBy(line) // Option.some('foldkit-metadata/runtimeOnly')
Evidence.issuedBy({ ...line }) // Option.none(): a copy was issued by no one
```

`Evidence.runtimeOnly` throws if `why` is empty or blank. Application code typically calls only `runtimeOnly` and `issuedBy`, and pattern-matches records with `Evidence.$match`.

**What the stamp proves.** A stamp identifies which issuer created the record object, not that the underlying claim is bug-free. Calling `Evidence.issuer(name)` twice with the same name throws, so later modules cannot impersonate an existing producer. Keep `Evidence.issuer` calls inside dedicated evidence-producing modules, and remember that a `Walked` record covers only the seeds and steps it ran.

## Exports

| Call | Meaning |
| --- | --- |
| `Metadata.key<A>(name, { merge, summarize })` | Declares a slot and returns a key with `of` and `get`. |
| `Metadata.empty` | A `Metadata` value holding no entries. |
| `Metadata.combine(parts)` | Merges entries from each part using each key's `merge` rule. |
| `Metadata.summarize(metadata)` | Formats each key's entries as text for docs and tooling. |
| `Metadata.is(value)` | Returns `true` only for values created by this module. |
| `Evidence.issuedBy(record)` | Returns `Option.some(producer)` if stamped, else `Option.none()`. |
| `Evidence.runtimeOnly({ transition, law, why })` | Creates a stamped `RuntimeOnly` record; requires non-empty `why`. |
| `Evidence.issuer(name)` | Creates a module-level issuer that freezes and stamps records. |
| `Evidence.Enumerated` / `Bounded` / `Scenario` / `Walked` | Record constructors and `$match` / `$is` helpers. |

## Limits

- **Opaque and frozen.** Only `of` and `combine` construct a valid `Metadata`. Spreads, `structuredClone`, or hand-built objects read and combine as empty. Entry arrays are shallow-frozen, so keep entry values immutable as well.
- **Key identity is per module instance.** Duplicate installs or hot-reloaded copies of an interpreter declare distinct key objects and will not see each other's entries. Declare keys once at module scope. Evidence stamps follow the same rule across duplicate copies of `foldkit-metadata`.
- **Not serializable.** `Metadata.summarize` outputs text for display and tooling; there is no built-in deserialization back to typed entries.

## Next

- Attach metadata to Model projections: [`foldkit-surface`](../surface/README.md).
- Declare domain invariants and emit `Enumerated` or `Bounded` evidence: [`foldkit-entity`](../entity/README.md).
- See how laws and evidence fit together: [Laws](../../docs/laws.md).
