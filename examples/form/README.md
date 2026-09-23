# foldkit-form stateful-control spike

A private feasibility harness, not a runnable example and not published. It
answers one question from the [Rich Text design](../../docs/design/richtext-DESIGN.md#41-form-integration-requires-one-generic-improvement)
(§41–45, track 2): can `foldkit-form` carry a **stateful control** — one whose
draft is a child Model rather than text, a flag, or a list of ids?

There is no DOM and no Rich Text here. `src/colorPicker.ts` is a colour picker
written as a Bundle: its own Model (`open`, `hex`, `recent`), Messages
(`Opened`, `Closed`, `Chose`, `Resolved`, `Failed`), a palette-lookup Command, a
keyboard Subscription while the popover is open, and a Managed Resource while a
picker exists.

`test/spike.test.ts` shows the control works, works under a plain parent, and
then pins exactly where the current Form API stops.

## What the spike found

| §41–45 requirement | Today | Evidence in the test |
| --- | --- | --- |
| A draft that is a child Model | `Draft` is `string \| boolean \| ReadonlyArray<string>`, `DraftKind` is `'text' \| 'flag' \| 'list' \| 'rows'` | `@ts-expect-error` on `Input.kind('ColorPicker', { draft: 'model' })` |
| Room for the control's state | a key's field is `{ _tag, value }` — a `FieldValidation.Field<string>` | `Object.keys(field)` is `['_tag', 'value']` |
| Child Messages reaching the form | the form's Message union is fixed; nothing routes a control's own Messages | the tag list has no `Opened`/`Chose`/… |
| Child Commands lifted | the form's update returns Commands for validation and submit only | the picker's Command is lifted by a plain parent instead |
| Child Subscriptions | the form's bundle declares none | `PostForm.bundle.subscriptions` is `undefined` |
| Child Resources | the form's bundle declares none | `PostForm.bundle.resources` is `undefined` |
| Placement per key | rows are placed; a key's state is plain data in `fields` | the picker needs `Bundle.at` under a parent, which is the mechanism the form would have to use |

So the *mechanism* is already there — Bundle placement carries the control's
Model, Messages, Commands, Subscriptions, and Resources under an ordinary parent
— and what is missing is the Form-side shape.

## The shape the spike points at

```ts
const ColorInput = Input.bundle('ColorPicker', {
  bundle: ColorPicker,
  /** The value this key holds and submits. */
  value: model => model.hex,
  /** A value the form was given, as the control's own Model. */
  fill: (model, hex) => ({ ...model, hex }),
  /** In-flight work cleared when the form is saved or resumed. */
  settled: model => ({ ...model, open: false }),
})

Form.make('PostForm', PostInput, { inputs: { color: ColorInput } })
```

What Form would need to make that real:

- `fields[key]` becomes a union: today's `FieldValidation.Field<Draft>`, or a
  control state holding the child Model beside its validation state.
- A route in the form's Message union for the control's Messages, the way
  `Nested` routes a row's form.
- `subscriptions` and `resources` on the form's bundle, keyed per stateful key,
  running while that key exists — which is what makes the popover's Resource and
  Subscription real rather than decorative.
- Per-control hooks in `fill`, `partial`, and `settled`.
- A renderer per kind in `foldkit-mixins-form`, as every other kind has.

## Constraints already known

- **Rows × stateful controls.** `Bundle.each` refuses Managed Resources today
  (one resource tag per placement), so a stateful control inside a repeated row
  needs either no Resource or a per-row keying that Bundle does not yet support.
- **Validation of a derived value.** The key's schema still validates the value
  (`value(model)`), so checks and rules keep working; what changes is where the
  draft lives.
- **Save and resume.** The encoded form Model already carries the control's
  state (§46), so a resumed draft restores the popover's contents too — which
  needs an explicit decision about what is worth keeping and what is cleared.

## Running it

```bash
pnpm vitest run examples/form/test
pnpm exec tsc -b examples/form
```

Like `examples/richtext`, this harness has no `package.json` on purpose: it
resolves its dependencies through `tsconfig.json` paths and the root vitest
aliases, so it adds no workspace install and no lockfile churn. Promote it when
the real implementation lands.
