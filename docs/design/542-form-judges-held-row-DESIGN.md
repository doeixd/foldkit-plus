# form/crud: an edit form judges an invariant only over the fields it sets, so a rule that reads a field outside the form is first judged when the save is sent; judge the edit over the held row, as the store does

**What happens today.** One invariant is judged by three things on the client's way to a save, each with different facts:

| Judge | Judges | Where |
| --- | --- | --- |
| The form, on submit | The input's own keys, with no row (`Entity.judgeInput`) | `packages/form/src/index.ts:1430-1445`, called from `finish` at `:1485` |
| The store, as the write is sent | The held row with the write laid over it, and the row before (`brokenByWrite`) | `packages/remote/src/mutation.ts:575-612`, from `writes.ts:247` |
| The server | The row the statement writes | the writer's `WHERE` |

`judgeInput` is undecided for "an invariant over a field the input does not set" (`packages/entity/src/invariant.ts:363-370`), and it has no row before, so it judges no transition. An edit form sets a few fields of a row that already exists. Any rule that reads a field outside the form, and every transition invariant, is therefore undecided in the form, though the row that decides it is in the store.

**Scenario (the two judgements confirmed with a scratch script against `packages/entity/src` at `19dbc89`; the Crud path is read from the code, not run).** A quote with two rules:

```ts
Entity.invariant('discountNeedsApproval', ({ after }) =>
  Expr.or(Expr.lte(after.discountPct, 15), Expr.isNotNull(after.approvedBy)), …)
Entity.invariant('confirmedPriceIsFixed', ({ before, after }) =>
  Expr.or(Expr.eq(before.status, 'draft'), Expr.eq(after.discountPct, before.discountPct)), …)

const EditInput = Entity.input(Quote, Schema.Struct({ id: Schema.String, discountPct: Discount }))
```

A rep's form sets `discountPct` and not `approvedBy`, which only a manager may set. The held row is `{ status: 'draft', discountPct: 10, approvedBy: null }` and the rep types 20:

```text
Entity.judgeInput(EditInput, { id, discountPct: 20 })              Undecided (fields: approvedBy)
Entity.judge(Quote, { after: held + edit, before: held })           Invalid by discountNeedsApproval
```

On a confirmed quote, changing the discount to 12:

```text
Entity.judgeInput(EditInput, { id, discountPct: 12 })              Undecided (fields: approvedBy)
Entity.judge(Quote, { after: held + edit, before: held })           Invalid by confirmedPriceIsFixed
```

**What the person sees.** Through Crud the sentence does arrive: the form passes, `Data.mutate` refuses before sending, and Crud shows a `Refusal.invalid` "beside each key its path names" (`packages/crud/README.md:401-403`). What differs from a rule the form can judge:

1. **When.** Only after Save is pressed. #192's rule is that an edit validates that key now. A cross-field rule is the one kind that does not follow it.
2. **As what.** A failed save (`SaveFailed`, `saveError`), not an invalid form. One sentence has two states, and the form's own "attempted" and error list never see it.
3. **Only through Crud.** A `Form.make` that an application submits itself judges nothing over the row. It learns of the rule from the server.
4. **Transitions.** The form never judges one, by design. The store can.

**Severity.** Low. No invalid row is stored and, with Crud, the message is shown. This is one question answered in two places with different facts, and feedback that arrives a step late.

**Proposal (sketch: a shape to review, not an API).**

- **One judge.** The `can` hint issue proposes one answer per write and row. Give it the input too: the write, the held row, the input so far. The form, the button and the pre-send check then call the same function and can only differ in the facts they hold.
- **The form takes the row it edits**, as an `Option`: none for a create, which judges as today. With a row, the form judges `after` as the row with the input's decoded keys laid over it and `before` as the row, so transition invariants are judged too.
- **Timing follows #192.** Judged on an edit of a key and on submit, never on a blur. On an edit, a failure is shown only beside a key the person has changed, so a rule about a field they have not reached does not scold them.
- **Marks as today.** `Invalid` marks the keys the invariant's path names that the form sets, through the same field-to-key map (`form/src/index.ts:1416-1423`), and the whole input when it names none. `Undecided` shows nothing.
- **The pre-send check stays.** The held row can move between the last keystroke and the send.
- **Crud passes its loaded row.**

**Open questions.**

1. **Which row.** The visible one, with pending layers, as `brokenByWrite` reads the store? A form over a row with a write in flight would then judge against a prediction.
2. **A rule over two keys of the form, mid-edit.** Typing the first makes the row invalid until the second is typed. Does the form wait for submit when every key the rule reads is the form's own?
3. **Operators.** The form judges with `options.operators` and the store with its bound table. One judge needs one table.

**Consumers.** Crud's editor, and `examples/writes`.

**Depends on.** The `can` hint issue, for the shared function. The descriptor issue: a form over the bare descriptor judges nothing either way.

**Done when.**

- The scenario's form shows "A discount over 15% needs an approval" beside the discount as 20 is typed, with nothing sent and the status not `SaveFailed`.
- A confirmed quote's form shows "A confirmed quote's price is fixed" on an edit of the discount.
- A create form behaves as today.
- A row missing `approvedBy` leaves the rule undecided: nothing is shown, and the server's refusal is shown as today.
- The form, the button and the pre-send check give the same answer for the same row and input, in one test over all three.
- Mutation specs: dropping the row from the form's judgement, and judging on a blur, each turn a named test red.

**References.** `packages/form/src/index.ts:1411-1490`, `packages/entity/src/invariant.ts:355-400`, `packages/remote/src/mutation.ts:566-612`, `packages/remote/src/writes.ts:236-262`, `packages/crud/README.md:396-405`, `docs/design/192-form-validation-timing-DESIGN.md`, `docs/design/entity-invariant-DESIGN.md` (status note: "a form judges invariants on submit only").
