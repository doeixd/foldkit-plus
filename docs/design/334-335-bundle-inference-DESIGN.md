# A bundle's Model comes from its Schema, and its services from every part (#334, #335)

Status: built (2026-10-30) in `foldkit-bundle`: `Bundle.make`, `Bundle.fromParts`,
`Bundle.lazy` and `Bundle.withHelpers`.

## The problem

`Bundle.make` had two ways to get a type wrong without an explicit annotation,
so seven primitives wrote out all ten of `make`'s generics.

- **#334, the Model.** `Model` was an inference site in the `Model` Schema and
  in `init`, `update`, `subscriptions` and `view`. A value in `init` competed
  with the Schema: `heights: {}` widened the field to `{}`, and a literal field
  (`status: 'idle'` for `Schema.Literals(['idle', 'busy'])`) widened to `string`
  and failed against the Schema, at `init`, with an error naming `string`.
- **#335, the services.** One `R` stood for the services of `init`'s,
  `update`'s and every helper's Commands. Helpers were only checked against it,
  so a helper needing a service failed with `Clock` not assignable to `never`.
  `init` and `update` both inferred it, and TypeScript picks one candidate
  rather than their union, so `init` needing `Clock` and `update` needing `Rng`
  failed too.

## Decision

```text
Model Schema   -> Model     (init, update, subscriptions, view, helpers are checked against it)
Message Schema -> Message   (likewise)
R = R(init) | R(update) | R(each helper's Commands)
```

- `make` reads a `MakeSpec`: the Schemas are the only inference sites for
  `Model` and `Message`; every other position is `NoInfer`.
- `Model` is a `const` type parameter. A paramless `init: () => ({ model })` is
  not context-sensitive, so TypeScript types its body in the first inference
  pass, before the Schema has fixed `Model`; under `NoInfer` alone `'idle'`
  still widened. A `const` type parameter keeps literals in that pass (through
  `NoInfer` and indexed access), and the Schema never supplies a literal
  expression, so `const` changes nothing else. Its cost: a paramless `init`
  writing `[]` for a mutable array field (`Schema.mutable(Schema.Array(...))`)
  reads `readonly []` and fails. No Model in the repository has one; give such
  an `init` a parameter or annotate its return.
- `init` and `update` each have their own services parameter (`RInit`,
  `RUpdate`), helpers are inferred freely (their services left open), and the
  bundle's `R` is the union with `HelperRequirements<Helpers>`, read from each
  helper's returned Commands.
- `fromParts` and `lazy` take the same rules; `withHelpers` adds its helpers'
  services to the bundle's `R` instead of requiring them to be there already.

`Bundle<...>` itself keeps one `R`: a placed bundle needs the union, and
nothing downstream (placement, `compose`, the assembly) cares which part asked.

## Rejected

- **Inferring the Schema type (`MS extends Schema.Top`, `Model = MS['Type']`).**
  The Model is still unfixed when a paramless `init` is typed, so literals
  widen exactly as before.
- **One `R` inferred from `helpers` as well.** More candidates for one type
  parameter, and TypeScript still chooses one rather than their union.

## What the change breaks

`make`'s, `fromParts`'s and `lazy`'s generic parameter lists change (`RInit`,
`RUpdate`, or `RInit`, `RBody` in place of `R`). A call that wrote them out
must drop them, which is the point; nothing that inferred them changes.
