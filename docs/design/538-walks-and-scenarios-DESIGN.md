# testing: lift `heldValue.test.ts`'s seeded walk into a helper, and add scenarios as data, as the evidence a law takes where nothing decides it

**What is missing.** Where a law cannot be decided from the declarations (a numeric invariant, a Sync document law, anything over the local Model's `update`), the evidence is a test. The tree has the right test, written once by hand for one reducer:

- `packages/remote/test/heldValue.test.ts` holds a generator for every Message variant, and "`messages` is checked against the union, so a new variant does not compile until it has one" (its header, lines 16-20).
- Its seeded walk (`:937`) draws cases at random, applies each through `Data.reduce`, and checks every step with `violations(model, message)`.
- `AGENTS.md` records what it taught: a walk moves when a case is added, and "a walk's green is only its seeds".

The compile-time half is what closes the hole this whole effort is about: the next Message cannot be added without a generator, and the walk then judges the law after it. Nothing offers that to an application, or to Sync, or to a second reducer here. And there is no way to state one expected behavior as data, so a refusal's test is hand-written each time.

**Proposal (sketch: a shape to review, not an API).**

*A walk.*

```ts
Walk.run({
  messages,                       // a generator per variant, checked against the Message union
  from: () => loaded(),           // a realistic Model
  step: (model, message) => update(model, message),
  violations: (before, message, after) => [...],   // each law, by id
  seeds: 200,
  steps: 12,
})
// On a failure: the seed, the path of cases, and the law broken.
```

- It returns a `Walked` evidence record naming its seeds and length, for the graph issue's rule.
- It keeps `regressions` as `heldValue.test.ts` does: a case that once broke it, from a Model of its own.

*A scenario*, in the shape Specter uses for a command: a history, an input, and an outcome that is a result or a refusal.

```ts
Scenario.of({
  name: 'a published product does not go back to draft',
  given: [{ id: 'p1', status: 'published', stock: 5, reserved: 1 }],   // rows for a write; Messages for an update
  when: [Revert, { id: 'p1', status: 'draft' }],
  expect: Scenario.refused(publishedStaysPublished),   // matched by declaration, as Refusal.isInvalidBy
})
```

- **Run against the real thing**: `update` for Messages, `RemoteServer.memory` for a declared write, `Trace.run` where the order of answers matters.
- **Over a history, not a Model.** A scenario survives a change to how the Model holds its state.
- **Generated where the check knows the answer.** Each arrow that holds gives an acceptance scenario, and each refused one gives a rejection naming its invariant. A hand-written scenario that contradicts a declared arrow is reported without running anything.
- **Both sides.** A scenario over a declared write also runs through `Law.check` (`packages/remote/src/law.ts`), so the client's prediction and the server's answer are compared.

**Consumers.** The rule in #439's closing note asks for a second caller before a test helper is exported. There are three:

- `heldValue.test.ts` itself, which becomes a call of the helper.
- The Sync law issue's test that a second durable Message is refused.
- `examples/writes`, for `Sell x reservedWithinStock`, which the check reports undecided.

**Not in scope.**

- Property-based shrinking, or a dependency on a property-testing library. The existing seeded generator is enough until a failure is too long to read.
- Executing a scenario's external effects.

**Done when.**

- `heldValue.test.ts` passes through the helper with the same seeds finding the same regressions.
- A Message variant without a generator is a type error at the call.
- The generated scenarios for `examples/writes` run green, and each has a mutation that turns it red, as `CONTRIBUTING.md` asks of every test.
- A scenario expecting `published -> draft` to land is refused before it runs, naming `publishedStaysPublished`.
- The helper ships from a testing entry point (`foldkit-plus/testing/…`), not from a runtime one.

**References.** `packages/remote/test/heldValue.test.ts:10-22` and `:925-960`, `AGENTS.md` ("A seeded walk moves when a case is added"), `packages/remote/src/testing.ts` (`Trace`), `packages/remote/src/law.ts`, `packages/remote-server/src/index.ts:1654`, `docs/design/239-plus-testing-DESIGN.md`, `devagrawal09/specter`'s `apps/reference/src/features/todos/change-todo-completion/spec.ts`.
