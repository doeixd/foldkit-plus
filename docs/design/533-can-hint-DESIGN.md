# entity/guard/remote: one `can` hint over the held row (rules, `when` and invariants), for a button and for an Agent capability's `available`

**What is missing.** Whether a declared write would land has three parts, and a client can ask only one of them ahead of time.

| Part | Refused as | Asked ahead of time today |
| --- | --- | --- |
| Who may | `Forbidden` | Yes: `Guards.may` (`packages/guard/src/may.ts`), read by Crud as `May.locks` (`packages/crud/src/index.ts:92-99`) |
| Whether it applies now (`when`) | `Unmet` | No. As far as I can find, nothing in `packages/remote/src` judges a write's `when` over the held row before sending |
| Whether the row it leaves is valid | `Invalid` | Only at the moment of sending: `brokenByWrite` (`packages/remote/src/mutation.ts:575`), called from `writes.ts:247` |

So a Publish button on an archived product is live until it is pressed, and an Agent capability that dispatches the same write restates the condition by hand:

```ts
available: model => model.todos.some(todo => todo.completed), // docs/agents.md:455
```

That callback (`packages/agent/src/expose.ts:247`) is a second statement of what the write's `when` already says.

**Proposal (sketch: a shape to review, not an API).** One answer per write and row, three-valued as `Entity.judge` is:

```ts
const answer = Write.can(Publish, { row, principal })
// { _tag: 'Yes' }
// { _tag: 'No', refusal }      the Refusal the server would send: Forbidden, Unmet, or Invalid naming the invariant
// { _tag: 'Undecided', … }     a field the row lacks, an operator the table does not run, an input not yet known
```

- **Built from what exists.** `Guards.may` for who, `Judge.predicate` (as `whyReasons.ts:183` uses it) for `when`, `Entity.judge` for the invariants over the row the write would leave.
- **A hint, never the check.** The sentence in `may.ts` applies unchanged: the write is checked again when made.
- **Input.** A write whose input is fixed apart from the id (`Publish` sets `status: 'published'`) is decided from the row alone. One with free input (`Restock`'s `quantity`) is decided per value, or undecided without one.
- **Agent.** A capability that dispatches a declared write takes `available` from this by default. A hand-written `available` still wins.
- **Refinements.** Once a write names its source state (the refinement issue), the `when` part is membership in that state. Nothing else here changes.

**Consumers.** Crud's buttons, which read `May.locks` today, and Agent capabilities backed by a Remote mutation. Both exist in the tree.

**Not in scope.**

- Deciding anything statically. That is the check issue; this judges one held row at run time.
- A Message no declared write backs. See the tracking issue's "what stays out".

**Done when.**

- `examples/writes` greys out Publish on a published or archived product and Revert on a published one, and shows the refusal's sentence as the reason.
- An Agent capability over `Publish` is absent from discovery where `when` is false, with no `available` written. Calling it by name fails with `AgentCapabilityUnavailableError`.
- A row missing a field the `when` reads answers `Undecided`, and the button stays live.
- Each of the three parts has a mutation spec: dropping it turns a named test red.
- `docs/declared-writes.md` gains a section under "What the client shows meanwhile".

**References.** `packages/guard/src/may.ts`, `packages/remote/src/mutation.ts:575-612`, `packages/remote/src/mutationDescriptor.ts:61-65`, `packages/agent/src/expose.ts:247`, `docs/agents.md:447-475`.
