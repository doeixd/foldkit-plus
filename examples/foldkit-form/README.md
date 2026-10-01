# Form

A waitlist signup: a name, an email and a message, checked as they are typed.
A well-formed email is then checked against a fake API (500ms) that knows three
addresses already on the list, and the submit sends the signup to a fake server
that succeeds or fails at random. It ports Foldkit's
[`examples/form`](https://github.com/foldkit/foldkit/tree/main/examples/form)
to Foldkit Plus.

Upstream writes the form by hand: a `Field` per input, a Message per field, a
rule set per field, and a `ValidateEmail` Command whose stale answers `update`
drops. Here all of that belongs to [`foldkit-form`](../../packages/form): the
input schema says what is valid, the form holds each draft and its state, runs
the email check, and hands the page a decoded signup. The page owns only what
happens to it.

```text
JoinWaitlist (Schema.Struct: the rules, the labels)
      |
Form.make ──► form Model in the page's Model, field by field
      |         Changed ──► rule ──► check (fake API, 500ms) ──► Valid | Invalid
      |         Submitted ──► every key valid, input decoded ──► Submitted { value }
      v
joinWaitlist (page) ──► Submitting ──► SubmitForm ──► SucceededSubmitForm | FailedSubmitForm
```

## Run it

```bash
pnpm --filter foldkit-example-foldkit-form dev
npx vitest run examples/foldkit-form   # from the repository root
```

## Who owns what

| Concern | Owner | Where |
| --- | --- | --- |
| What a signup is: the three keys, their rules and labels | the `JoinWaitlist` schema, read through `Entity.input` (`foldkit-entity`) | `src/main.ts`, `FORM` |
| Each draft and its state (`NotValidated`, `Validating`, `Valid`, `Invalid`) | `foldkit-form`, as Foldkit's own `fieldValidation` Fields | `model.form` |
| "Email is required", and the words of each rule | the form's `messages`, and the rules themselves | `FORM` |
| The waitlist check, and dropping an answer for an email since edited | the form's `checks`, with `debounce: 0` | `FORM` |
| Deciding the input is valid, and decoding it on submit | the form: `Submitted` gives the page a typed `JoinWaitlist` | `UPDATE` |
| Whether a submit is in flight, its success or failure | the page's `Submission` | `MODEL`, `UPDATE` |
| Accessible inputs, textarea and button | `@foldkit/ui` | `VIEW` |
| Their look: the shipped `Input`, `Textarea` and `Button` recipes | `foldkit-mixins-ui` | `src/style.ts` |
| Field metadata and dispatch for the custom layout | `foldkit-mixins-form` (`FormView.fields` + `foldkit-mixins-form/ui`'s shared field override) | `src/main.ts`, `VIEW` |
| Border and words following each field's state | `Style.whenInput` over the field (`foldkit-mixins`) | `src/style.ts` |
| Page Slots, layout, theme tokens, layer order | `foldkit-mixins` | `src/style.ts` |

The form is placed with Foldkit's own `Update.foldChild`: its Model is a field
of the page's, its Messages arrive as `GotFormMessage`, and its out Message
becomes `joinWaitlist`.

## What is not used, and why

- **The generated whole-form layout from `foldkit-mixins-form`.** This port
  keeps its label/mark layout and styled submit button. `FormView.fields`
  supplies the field metadata and Messages; the optional
  `foldkit-mixins-form/ui` override draws Input and Textarea with blur and
  accessible checking/error descriptions. The generated view can use the same
  overrides. Its default submit policy waits for running checks; a strict
  `canSubmit` predicate on `FormView.submodel` can disable submit instead.
- **`foldkit-bundle`.** The form is one child placed once; `Update.foldChild`
  is the lift upstream's examples use, and a Bundle placement would add a
  second way to wire it.
- **`foldkit-remote`, `-sync`, `-mirror`, `-surface`, `-agent`, `-crud`.**
  Nothing here is server data to cache, an edit to replicate, state for the
  URL or storage, or a screen for an agent. The two fake APIs are Commands, as
  upstream's are.

## Differences from upstream

- **Submitting an invalid form says what is missing, and takes the reader
  there.** Enter, or a click on the greyed button (`@foldkit/ui` marks it
  `aria-disabled`, so it still submits), validates every key: an untouched
  email reads "Email is required", and focus moves to the first key the form
  says is missing. Upstream sends nothing and shows nothing.
- **A submit made while the email is being checked is kept**, and goes out once
  the check passes. Upstream drops it.
- **An emptied message box shows no `✓`.** To the form an empty draft is
  nothing entered (`NotValidated`); upstream marks every message `Valid`.
- **Messages.** The three `Updated*` Messages, `CompletedValidateEmail` and
  `ClickedFormSubmit` are the form's `Changed`, `Checked` and `Submitted`,
  carried by `GotFormMessage`; the check is the form's Command
  `Waitlist.check`, not `ValidateEmail`.
- **Ids** are the input's keys, so the message box is `messageText`.
- **The `◐` turns.** Upstream asks Tailwind to spin an inline span, which a
  transform leaves still.

## Tests

- `test/story.test.ts` and `test/scene.test.ts` are upstream's stories and
  scenes, driven through the form's Messages, plus the differences above, a
  check mark scene, and a check answer for an older email leaving the Model as
  it was.
- `test/check.test.ts` runs the form's real check Command on the TestClock: it
  answers after 500ms and not before, for a free, a taken and a differently
  cased address.
- `test/view.test.ts` draws the page inert in every field and submission
  state: every element is in a Slot, the borders follow the field, and the
  stylesheet defines every token the styles read.
- `test/runtime.test.ts` runs the real runtime in jsdom: the real check and its
  delay, the button's gate, and the CSS of every class and the spinner's
  keyframes injected.
- `test/focus.browser.test.ts` runs the real runtime in a browser and presses
  Enter as a reader would: a refused submit puts focus on the first key it
  says is missing. A browser, because a synthetic event moves no focus.
