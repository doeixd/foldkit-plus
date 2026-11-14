# foldkit-metadata

Typed facts one package attaches to a value another package carries. The
carrier merges them without knowing what they mean; only the package that
declared a key can write or read its entries.

It also holds `Evidence`: records that a transition keeps a law, which
`foldkit-entity`, `foldkit-remote` and a test produce and `foldkit-surface`'s
graph reads. They live here because Entity and Surface both depend on this
package and not on each other.

## When to use it

Use it when you are writing a **carrier** (a description other packages
decorate, such as a Surface `Projection`) or an **interpreter** (a package that
decorates someone else's description, such as `foldkit-remote` recording the
server data a selection needs).

Applications rarely import it. `foldkit-surface` re-exports `Metadata`, so an
application that already uses Surface imports it from there.

It does not hold application state. Metadata describes a static declaration; it
is not read from the Model and nothing dispatches a Message when it changes.

## Mental model

```text
interpreter              carrier                     interpreter / tooling
Key.of(value)  ──►  Metadata.combine(parts)  ──►  Key.get(metadata)
                    (each key's own merge)        Metadata.summarize(metadata)
```

- The **key** owns the entry type, how duplicates `merge`, and how an entry is
  `summarize`d as text.
- The **carrier** owns where metadata lives and when parts are combined. It
  never inspects entries.
- Lookup is by the key object, never its `name`, so two packages that pick the
  same name cannot read each other's entries.

## Install

```sh
pnpm add foldkit-metadata effect
```

## Example

```ts
import { Metadata } from 'foldkit-metadata'

// An interpreter declares its slot once, at module level.
const Flags = Metadata.key<string>('flags', {
  merge: flags => [...new Set(flags)],
  summarize: flag => flag,
})

// A carrier combines whatever its parts hold.
const combined = Metadata.combine([Flags.of('beta'), Flags.of('beta', 'gamma')])

Flags.get(combined) // ['beta', 'gamma']
Metadata.summarize(combined) // [{ name: 'flags', entries: ['beta', 'gamma'] }]
```

`Flags.of` and `Metadata.combine` only build values; nothing runs and nothing is
registered globally. `merge` runs inside `of` and inside `combine`, so `get`
always returns normalized entries.

## Writing a merge rule

A carrier can combine already-combined parts. Write `merge` so regrouping those
parts preserves the meaning you intend. The example uses a set union: combining
the same flag twice does not duplicate it. A concatenating merge instead retains
duplicates and order. Choose that behavior explicitly.

`Flags.get(Metadata.empty)` returns an empty array. Another key named `flags`
also reads an empty array from `combined`: names label summaries; key identity
controls lookup. A key is an integration token, not an authorization boundary
against code that already has access to that key.

`merge` and `summarize` are your callbacks. If they throw, the exception reaches
the caller; this package supplies no retry or validation layer.

## Evidence

A law (`Product.reservedWithinStock`) is kept by a transition (`write:Sell`)
only if something showed it. An `Evidence` record says what did:

| Record | Issued by | When |
| --- | --- | --- |
| `Enumerated` | `Laws.check` (`foldkit-entity`) | It kept the pair by reading the declarations |
| `Walked` | `Walk.run` (`foldkit-remote/testing`) | Every seeded walk from every start passed; it names the seeds, steps and starts |
| `Scenario` | `Scenario.run` (`foldkit-remote/testing`, not built yet: #538) | A scenario ran on a runner with no mismatch |
| `RuntimeOnly` | `Evidence.runtimeOnly` | By hand: only the writer or the journal refuses it in production, and `why` nothing earlier covers it |

A record is plain data, so anyone can type one. What tells a produced record
from a typed one is the **stamp**: each producer makes an issuer once and
issues every record it returns, and the issuer keeps those records by
identity. A record built with `Evidence.Enumerated(...)` and not issued, or
copied with a spread, was issued by no one, so a reader can refuse it.

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

`runtimeOnly` throws on an empty or blank `why`. An application calls only
`runtimeOnly` and `issuedBy`; it reads records with `Evidence.$match`.

**What the stamp does not prove.** It says which producer made a record, not
that the record is true. A name has one issuer: a second
`Evidence.issuer('foldkit-entity/laws')` throws, so nothing loaded after a
producer can stamp as it, but nothing stops an author taking an unused name
in a test. This repository's `pnpm evidence:check` refuses a call outside the
producer modules. And a `Walked` record says only which seeds passed.

## API

| Call | Meaning |
| --- | --- |
| `Metadata.key<A>(name, { merge, summarize })` | Declares a slot. Returns a key with `of(...values)` and `get(metadata)`. |
| `Metadata.empty` | The value with no entries. |
| `Metadata.combine(parts)` | One value holding every part's entries, merged per key. |
| `Metadata.summarize(metadata)` | Each key's entries as text, for tooling such as `Module.toMarkdown`. |
| `Metadata.is(value)` | True only for a value this module made. |
| `Evidence.issuedBy(record)` | The producer that issued `record`: an `Option`, none for a record typed by hand or copied. |
| `Evidence.runtimeOnly({ transition, law, why })` | An issued `RuntimeOnly` record; throws on an empty `why`. |
| `Evidence.issuer(name)` | For a producer, once at module level: `{ name, issue(record) }`, where `issue` returns a frozen, stamped copy. Throws for a name that already has an issuer. |
| `Evidence.Enumerated` / `Scenario` / `Walked`, `$match`, `$is` | A producer's records before it issues them, and reading a record by kind. |

## Limits

- **Opaque and frozen.** Only `of` and `combine` make a `Metadata`. A spread,
  a `structuredClone`, or a hand-built object with the brand has no entries:
  it reads as empty and combines as empty. Entry arrays are frozen; objects stored inside them are not deep-frozen.
  Treat entry values as immutable too.
- **Key identity is per module instance.** Two copies of an interpreter (a
  duplicated install, a reloaded module) declare two keys and do not see each
  other's entries. Declare a key once, at module level. Evidence stamps are
  the same: a record issued through one copy of `foldkit-metadata` reads
  `issuedBy` none in another, so a reader there undercounts it rather than
  trusting a stamp it cannot check.
- **Not serializable.** `summarize` gives text for display; there is no decode
  path back to entries.
