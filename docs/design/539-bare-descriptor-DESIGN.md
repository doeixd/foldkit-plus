# entity: a form or a write built on a descriptor of an Entity made before its invariants were attached judges none of them, and says nothing

**What is wrong.** An invariant is kept in the metadata of the descriptor it was attached to (`invariantsOf` reads `Invariants.get(entity.metadata)`, `packages/entity/src/invariant.ts:305-309`). Attaching one returns a new descriptor of the same Entity (`remake`, `packages/entity/src/descriptor.ts:117-119`). The descriptor from before still exists, and it must, because a guard rule and the invariant itself are written against it. `examples/writes` therefore has two names for one Entity:

```ts
const ProductFields = Entity.define('Product', …)                       // domain.ts:13
export const reservedWithinStock = Entity.invariant<typeof ProductFields>(…)   // :36
export const Product = ProductFields.pipe(Guards.attach(…), reservedWithinStock, publishedStaysPublished)  // :57
```

Anything built on `ProductFields` judges no invariant, and nothing reports it.

**Scenario (confirmed with a scratch script against `packages/entity/src` at `19dbc89`).** With the two invariants above and the row `{ id: 'p1', stock: 3, reserved: 5, status: 'draft' }`:

```text
Entity.judge(Product, { after })                    Invalid
Entity.judge(ProductFields, { after })              Valid
Entity.judgeInput(Entity.input(Product, …), row)        Invalid
Entity.judgeInput(Entity.input(ProductFields, …), row)  Valid
```

**Where it reaches.**

- **A form.** `foldkit-form` judges on submit with `Entity.judgeInput(input, …)` (`packages/form/src/index.ts:1432`). Over the bare descriptor it shows no message.
- **The client's pre-check.** `brokenByWrite` reads `write.input.entity` (`packages/remote/src/mutation.ts:583`). Over the bare descriptor it refuses nothing, so an invalid write is sent.
- **The server** still refuses, if its binding was made from the full descriptor: the Drizzle writer reads its invariants from the binding. I have not checked what happens when the binding is made from the bare one, nor whether `checkConstraints` then lists no `CHECK`.
- **Rules.** `Guards.attach` returns a new descriptor the same way. I have not checked whether a write over the bare descriptor loses its rules on the client.

**Severity.** Medium. The server holds where it is bound correctly, so no invalid row is stored. What is lost is silent: the form's message and the refusal before sending. And the two names are one keystroke apart.

**Why the type system does not catch it.** Both descriptors have the same type parameters. Relations, derived members and `sets` do not have the problem: they are added to the Entity's identity, "which every descriptor of it then reads" (`descriptor.ts:126-135`).

**Suggested fix, in order of preference.**

1. **Keep invariants with the identity**, as relations, derived members and `sets` are kept. Every descriptor then judges them, and the bare name stops being a hazard. Check the two refusals that depend on attachment order: an id declared twice, and a `DeclaredInvariant`'s `entity` read before it is attached.
2. **Or refuse it where both are seen.** Where a domain, a server or a form receives a write or an input, compare its descriptor's invariants with those of the registered descriptor of the same identity, and fail by naming the one to use.
3. Either way, say in `docs/declared-writes.md` which name a write takes.

**Done when.**

- The four calls above answer `Invalid`, or the two over the bare descriptor fail where they are built, naming `Product`.
- A test over each of form, `brokenByWrite` and the Drizzle writer, with a mutation that turns it red.
- The same question is answered for `Guards.attach`, in this issue or one it opens.

**Related.** The refinement issue adds a third kind of descriptor of one Entity, and depends on this.
