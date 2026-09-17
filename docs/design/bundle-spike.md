# foldkit-bundle: Phase 0 verification notes

Checked against the installed `foldkit@0.158.2` and `effect@4.0.0-rc.112`
declarations and runtime source. The workspace stays on `0.158.2`: every API the
design needs already exists there.

| # | Question | Finding | Decision |
| --- | --- | --- | --- |
| 0.2 | `Update.foldChild`, `foldChildStep`, `FoldContext`, `combine` | All present with the documented shapes. `Update.Return` has `outMessage?: never`, so a plain `Return` is assignable to `ReturnWithOutMessage<…, never>`. `foldChild` with `foldOutMessage` accepts either. | A bundle's `update` is typed as `ReturnWithOutMessage`; placement always folds through `foldChild` with an `onOut` Step. (Built with `foldChildStep`.) |
| 0.3 | Does `Subscription.lift` evaluate `when` before `toChildModel`? | Yes. The gated entry computes `pipe(parent, Option.liftPredicate(when), Option.map(toChildModel), Option.map(modelToDependencies))`. | Gate on "child present and `link.when`", and read the child with `Option.getOrThrow` inside `toChildModel`. No custom entry needed. |
| 0.4 | `ManagedResource.lift` with an `Option` child; renaming keys | `lift` takes `toChildModel: Parent => Option<Child>` and maps each entry; record keys are free to rename. **But** the runtime provides each entry through `config.resource._tag`: two entries with the same tag overwrite each other in one Layer. | Namespacing keys is not enough. Placing one bundle with resources twice is rejected when the assembly is built (duplicate `resource.key`), with a message naming both placements. |
| 0.5 | `h.submodel` config; empty Html | `h.submodel({ slotId, model, view, toParentMessage, viewInputs? })`, where `view` must come from `Submodel.defineView`. `Html` is `VNode \| null`. | A placed view returns `null` when the child is absent. |
| 0.6 | Building a wrapper variant Schema generically | `taggedStruct(tag, { message: ChildMessage })` from `foldkit/schema` returns a callable `TaggedStruct`, the same constructor `defineMessageUnion` produces per variant. | `Link.wrapper` uses `taggedStruct`. |
| 0.7 | Per-key keep-alive for collections | Deferred to Phase 3. `keepAliveEquivalence` plus `readDependencies` exist. | Collections ship v1 restart semantics first. |
| 0.8 | `Runtime.makeApplication` config type for `Bundle.application` | Deferred to Phase 2. | Superseded: `Bundle.application` was not built; `assembly.complete(config)` checks a config for any runtime constructor. |
