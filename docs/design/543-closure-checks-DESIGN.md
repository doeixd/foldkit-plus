# sync/surface: a durable Message that reads outside the shared projection is accepted and replays to a different slice; check closure there, and four related checks

**Where this comes from.** Rosas et al., "Software in the natural world: A computational approach to hierarchical emergence" (arXiv:2402.09090v2), asks when a coarse-grained view of a process is a level in its own right. Its answer, for a process read as an automaton (Definition 5), fits this repository directly:

> A projection of the Model, with a set of Messages, is **closed** when the projection after a Message depends only on the projection before it and the Message.

A closed projection can be predicted, replayed and set from outside without the rest of the Model. Sync's shared slice, a Surface an agent reads, and the rows a client holds are each relied on as if they were closed. Only half of that is checked. The five parts are separate changes; the first is a fault today.

One caution. The paper is about stochastic processes whose machines are inferred from data. An application is a designed automaton driven by outside input. What carries over is the structural condition above, not the information-theoretic measures.

## 1. A durable Message that reads outside the shared projection

**What is wrong.** `derivedReplay` (`packages/sync/src/make.ts:345-397`) installs the shared slice into `initial`, applies the Message, and reads the slice back. It refuses a Message that returns a Command or changes a field outside the projection. It cannot see one that reads a field outside the projection, because during replay that field always holds its initial value.

`Sync.mount`'s header (`packages/sync/src/mount.ts:1-9`) says a durable Message is "a state-only, deterministic transition of the shared projection (the derived replay enforces it)", and so applies the application's own `update` to the live Model at once and persists the Message afterwards. For reads, the replay enforces nothing.

**Scenario (confirmed with a scratch test in `packages/sync/test` at `19dbc89`, at the replica; what the mount then shows is read from its code, not run).** A Model `{ todos, filter }`, with `todos` shared and `filter` local. A durable `ClearedShown` removes the todos the person is looking at:

```ts
ClearedShown: () => ({
  ...model,
  todos: model.todos.filter(todo => (model.filter === 'done' ? !todo.done : false)),
})
```

Two todos, `a` done and `b` not, and the person's filter is `done`:

```text
replica.submit(ClearedShown())          Success
update(live Model, ClearedShown())      todos: [b]
replica.shared after replay             todos: []
```

The Message is accepted. The screen shows `b`, from the live `update`. The replica, the server and every other device hold nothing, from the replay under `filter: 'all'`. The screen changes to match when the slice is next re-installed (an exchange, a reload). Nothing reports it.

Replicas still converge with each other, because all of them replay under the same initial values. What is lost is the author's intent, and what the author is shown.

**Severity.** High. It is silent, it loses data the author did not ask to remove, and the guard that is meant to catch it is named in the code as catching it.

**This is the plan's open question.** `docs/design/contract-layer-PLAN.md:495`, Q13: "Can we check that `update` reads nothing a reader's slice lacks, or only document it?", with the first idea being to derive each Message's reads from its Projection. The closure condition gives a second way that needs no derivation.

**Suggested fix.**

- Where both are in hand (the mount, or `submit` given the live Model), compare the slice of `update(live, message)` with the replay's result. Where they differ, refuse the Message as the write check does: `durable "ClearedShown" reads Model fields outside the shared projection: filter`.
- To name the fields, on the failing path only, run `update` again with each unowned field reset to its initial value in turn, and list those that change the slice.
- Like the write check, it fires on the first submit where the read matters, not at definition. Static derivation of reads, if it proves possible, would complement it.
- Correct the mount's header either way.

**Done when.**

- The scenario's Message is refused before it reaches the outbox, naming `filter`.
- A durable Message that reads a local field without it changing the slice is accepted.
- A pending operation in the outbox does not cause a false refusal: the comparison is against the visible slice.
- Mutation specs: dropping the comparison, and comparing against the committed slice, each turn a named test red.
- The durable-Message section of the Sync README says "reads" beside "writes".

## 2. Test from any valid state, not only a reachable one

**What is missing.** The paper separates closure that holds from every state (strong lumpability) from closure that holds only from particular starting conditions (weak), and shows the weak kind breaks under a perturbation. The seeded walk in `packages/remote/test/heldValue.test.ts` starts from `loaded()` (`:266`), so what it establishes is the weak kind: laws over states the Messages themselves can reach.

States also arrive by being installed: a Sync checkpoint and a Mirror restore through `WritableProjection.set` (`docs/state-model.md:37-62`), a hydrated snapshot, a row written by raw SQL. `docs/declared-writes.md` already allows for a row that is invalid before a write.

**Proposal.** The walk helper (see the walks-and-scenarios issue) takes its starting Models and rows from the Schema as well as from a realistic fixture, so each law is tried from states no Message produced.

**Open question.** That issue leaves a property-testing dependency out of scope. Deriving values from a Schema is the usual reason to add one. Either write small generators per field kind, or accept the dev dependency here.

**Done when.** A law that holds from `loaded()` and fails from an installed state is found by the helper, with the state printed.

## 3. Treat `Undecided` as a request for fields

**What is missing.** When the client cannot decide a rule, `Entity.judge` already says what it lacked: `{ _tag: 'Undecided', fields, operators }` (`packages/entity/src/invariant.ts:345`). In the paper's terms that list is what the client's level is missing to be closed for that rule. Nothing acts on it: the rule is left to the server.

**Proposal (sketch: a shape to review, not an API).** A form or write whose input sets a field on an invariant's path asks for the rest of that invariant's fields in its Selection, as a write already says what its row needs loaded (`foreseenOfWrite`, `packages/remote/src/mutation.ts:366`). The client then holds what it needs to judge the rule before sending.

- A field the reader may not read stays undecided, as `docs/declared-writes.md:347` describes for a member a Read rule hides.
- An operator the client's table does not run stays undecided too.

**Consumer.** The form-judging issue: its undecided case becomes rare without anyone listing fields by hand.

**Done when.** The quote form from that issue, selecting only `discountPct`, loads `approvedBy` because `discountNeedsApproval` reads it, and shows the rule's message on an edit.

## 4. A refinement and a projection read the present only

**What is missing.** The paper's implication from causal closure to computational closure holds for coarse-grainings of the current state and fails for ones defined over history (its Counterexamples 3 and 5). The tree already follows this where it matters: `cms.published` reads a stored `publishedAt`, and a wait is "a value in the Model" (`docs/design/482-temporal-laws-MATRIX.md:9`). The refinement issue does not say it.

**Proposal.** `Entity.refine`'s predicate is built over `row` alone and is refused where declared if it reads `before`. "Was ever published" is a stored field. The law-first guide gets one sentence: when a state depends on the past, store the fact.

**Done when.** A refinement reading `before` is refused by name, in the change that builds refinements.

## 5. A Surface may declare itself closed

**What is missing.** Most Surfaces are views and need not be closed. Some are relied on as if they were: the slice Sync replays (part 1), the context an agent predicts from, a slice Mirror restores. `Module.validate` checks declared ownership (`ownership-overlap`, `message-claimed-twice`). Nothing checks behavior.

**Proposal (sketch).** `closed: true` on a Surface, tested by the same comparison as part 1:

- for a Message in the Surface's set, the projection after depends only on the projection before and the Message;
- for a Message outside it, the projection does not change.

The closed Surfaces of an application, ordered by projection, are the paper's lattice of levels, and belong in the contract graph. Two that behave identically are one level declared twice.

**Consumer.** None beyond Sync today, so following #439's closing note this waits. It is built when a second caller (Agent or Mirror) needs part 1's comparison, by moving that comparison into a helper.

## Order

1. Part 1 now.
2. Part 4 with the refinement issue.
3. Part 3 with the form-judging issue.
4. Part 2 with the walk helper.
5. Part 5 when it has a second caller.

**References.** `packages/sync/src/make.ts:345-397`, `packages/sync/src/mount.ts:1-9`, `packages/sync/test/forApplication.test.ts:136-160`, `docs/design/contract-layer-PLAN.md:373-380` and `:495`, `docs/replication.md:146-152`, `docs/state-model.md`, `packages/remote/test/heldValue.test.ts`, `packages/entity/src/invariant.ts:311-349`, `packages/surface/src/index.ts:1809-1960`. Paper: Rosas, Geiger, Luppi, Seth, Polani, Gastpar, Mediano, arXiv:2402.09090v2, Definition 5, Theorems 2 and 3, Counterexamples 3 to 5.
