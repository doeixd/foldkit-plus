# Bundles: packaging a Submodel once

> **Status:** implemented as `foldkit-bundle` and `foldkit-bundle-surface`
> (0.1.0, not yet published). This note records the decisions and what is
> deferred; the package READMEs are the API reference.

## The problem

A Foldkit Submodel is wired by hand in five places: the update fold, init, the
Subscription lift, the Managed Resource lift, and the view. Placing the same
child twice repeats all five, and forgetting one is silent: a Subscription that
never runs, a resource never acquired, a Message variant the parent never
routes.

## The model

```text
Bundle  (what: Model, Message, init, update, subscriptions, resources, view, helpers)
  +
Link    (where: a lens onto the child Model, and the parent Message variant)
  =
Placed  (the same parts, lifted through Foldkit's own lifts)
```

A Bundle holds no state. A placement is an ordinary Submodel: the parent Model
owns the child's slice, the child's Messages are a parent variant, and every
transition goes through the parent's `update`. A placement is therefore an
**owner** of its path, which is what `foldkit-bundle-surface` records.

## Decisions

| Decision | Why |
| --- | --- |
| Compile to `foldChildStep`, `Subscription.lift`, `ManagedResource.lift`, `h.submodel` | No new effect category; Story and Scene resolve lifted Commands by their child definitions. A parity test compares a placement with the same child wired by hand. |
| Gate Subscriptions on "child present and `when`" and read the child with `getOrThrow` | `Subscription.lift` evaluates `when` before `toChildModel` (verified in 0.158.2). |
| `args` threaded to `update` as a third parameter | Behaviour can depend on configuration without storing it in the Model. |
| `args` required when `init` takes them; `onOut` required when the bundle has an OutMessage | An OutMessage cannot be dropped by omission. |
| `assembly.complete(config)` instead of `Bundle.application` | Returns the config unchanged, so it works with every runtime constructor rather than re-declaring `makeApplication`'s overloads. It reports a missing wrapper variant, unwired Subscriptions, and unwired resources at the property that is wrong. |
| `Bundle.assemble` fails at startup on a shared key or resource tag | The runtime provides a Managed Resource by its tag, so a second placement with the same tag would silently replace the first. |
| Placed views infer the parent's builder type, not its Message | Inferring a Message through `HtmlBuilder<M>` cost ~2,300 type instantiations per call; the change cut a 100-placement check from 6.6 s to 2.0 s ([benchmarks](../benchmarks.md)). |
| Collections (`each`) use string keys in a `Record` field and one parent Subscription entry per child entry | Restart semantics are simple and correct; keep-alive child entries keep alive per item. |
| `add(key, prepare)` | An item cannot see its key; the parent writes what only it knows, such as the id. |
| `each` rejects bundles with resources at the type level | Items would share one resource tag. |

## Deferred

- **Per-key keep-alive for collections.** Adding one item restarts every item's
  stream for that entry. Keeping the others running needs the running stream to
  learn that the item keys changed, but Foldkit 0.158.2 only offers
  `readDependencies`, which is pull-only (its one user, `@foldkit/ui`
  drag-and-drop, polls it each animation frame). Without polling every
  collection, this needs a dependency-change signal from Foldkit's runtime, such
  as a Stream of dependencies alongside `readDependencies`.
- **Resources in collections.** Needs either a pooled parent resource or a
  keyed `ManagedResource` upstream.
- **Re-rooted Surfaces per placement.** A Surface names Messages by parent
  constructor and an agent exposes one capability per constructor, but all of a
  placement's Messages travel under one wrapper variant. Exposing them one by one
  needs Surface and Agent to understand wrapped variants. Projections and Mirrors
  over a placement already work through the application's ref tree.
- **Further shorthands.** `Bundle.declare` and `declareEach` derive the wrapper
  name, Model field, and Message cases from a field name. Deriving the whole
  parent Model and Message from an assembly waits for use in real applications.

## Evidence

- [Phase 0 verification notes](./bundle-spike.md): which Foldkit APIs a
  placement compiles to, checked against 0.158.2.
- `packages/bundle/test`: parity with hand-wired lifts, runtime tests on
  `makeElement` for placements and collections, and type tests for each wiring
  mistake.
- [`examples/bundle`](../../examples/bundle): a settings page with a bundle
  placed twice, `@foldkit/ui` Tabs through `fromParts`, and a collection,
  validated by `Module`.
