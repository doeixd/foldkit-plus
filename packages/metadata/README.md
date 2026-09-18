# foldkit-metadata

Typed facts one package attaches to a value another package carries. The
carrier merges them without knowing what they mean; only the package that
declared a key can write or read its entries.

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
pnpm add foldkit-metadata
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

## API

| Call | Meaning |
| --- | --- |
| `Metadata.key<A>(name, { merge, summarize })` | Declares a slot. Returns a key with `of(...values)` and `get(metadata)`. |
| `Metadata.empty` | The value with no entries. |
| `Metadata.combine(parts)` | One value holding every part's entries, merged per key. |
| `Metadata.summarize(metadata)` | Each key's entries as text, for tooling such as `Module.toMarkdown`. |
| `Metadata.is(value)` | True only for a value this module made. |

## Limits

- **Opaque and frozen.** Only `of` and `combine` make a `Metadata`. A spread,
  a `structuredClone`, or a hand-built object with the brand has no entries:
  it reads as empty and combines as empty. Entry arrays are frozen.
- **Key identity is per module instance.** Two copies of an interpreter (a
  duplicated install, a reloaded module) declare two keys and do not see each
  other's entries. Declare a key once, at module level.
- **Not serializable.** `summarize` gives text for display; there is no decode
  path back to entries.
