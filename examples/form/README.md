# foldkit-form stateful-control harness

A private harness, not a runnable example and not published. It began as the
feasibility spike for a **stateful control** in the [Rich Text design](../../docs/design/richtext-DESIGN.md#41-form-integration-requires-one-generic-improvement)
(§41–45, track 2): a control whose draft is a child Model rather than text, a
flag, or a list of ids. That capability now exists as
[`Input.bundle`](../../packages/form/README.md#a-control-with-a-model-of-its-own),
and this harness is its acceptance test, shared with the
[page builder design](../../docs/design/pagebuilder-DESIGN.md#11-the-builder-is-a-form-control-inputbundle)'s
Phase 0.

There is no DOM and no Rich Text here. `src/colorPicker.ts` is a colour picker
written as a Bundle: its own Model (`open`, `hex`, `recent`), Messages
(`Opened`, `Closed`, `Chose`, `Resolved`, `Failed`), a palette-lookup Command, a
keyboard Subscription while the popover is open, and a Managed Resource while a
picker exists.

`test/spike.test.ts` shows the control on its own, under a plain parent, and
then as a Form key through `Input.bundle`:

| What a stateful control needs | How `Input.bundle` gives it |
| --- | --- |
| A draft that is a child Model | the key's draft is the picker's Model, typed |
| Its own Messages reaching it | the form's `Control` Message, built by `form.control(key).send` |
| Its Commands lifted | answered as `Control` Messages |
| Its Subscriptions and Resources | the form's own, keyed under the key |
| Validation of a derived value | the key's schema validates `value(model)` |
| An edit only when the value changes | opening the popover is not an edit; choosing a color is |
| fill, partial, submit | through `value` and `fill` |
| Save and resume | the Model round-trips through the form's schema, and `settled` closes the popover |

## Constraints

- **Rows × stateful controls.** A row of a nested form is plain data, so a
  nested form whose control has Subscriptions or Resources is refused when the
  outer form is made.
- **No OutMessage, no services.** The control's Bundle hands nothing to a
  parent, and its Commands need no services.
- **No checks.** A key with such a control takes no `check`; its schema says what
  is valid.

## Running it

```bash
pnpm vitest run examples/form/test
pnpm exec tsc -b examples/form
```

Like `examples/richtext`, this harness has no `package.json` on purpose: it
resolves its dependencies through `tsconfig.json` paths and the root vitest
aliases, so it adds no workspace install and no lockfile churn.
