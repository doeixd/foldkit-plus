# Job Application

A seven-step application to work on Foldkit: personal details, work history,
education, skills, a cover letter, attachments, and a review that submits.
Fields are checked as they are typed (the email also against a fake API that
knows three addresses in use), each step's tab says whether it needs attention,
and a live preview builds a resume beside the form. It ports Foldkit's
[`examples/job-application`](https://github.com/foldkit/foldkit/tree/main/examples/job-application)
to Foldkit Plus.

Upstream writes every validated field by hand: a `Field` in the Model, a
Message per field, a rule set, and, for the email, a `ValidateEmailAsync`
Command whose stale answers `update` drops by a counter. Here each record's
validated fields are a [`foldkit-form`](../../packages/form) form: the
applicant's, and one per position, degree and skill. The rest stays as
upstream wrote it: steps are Submodels folded with `Update.foldChild`, and the
pickers, file drops, tabs and menu are `@foldkit/ui` components.

```text
Applicant / Position / Degree / Skill (Schema.Struct: the rules and the labels)
      |
Form.make ──► a form Model in the step or entry, key by key
      |         Changed ──► rule ──► (email) check, fake API 600ms ──► Valid | Invalid
      |         isValid ──► isComplete             Invalid anywhere ──► hasErrors
      v
ClickedSubmit ──► each step's revealErrors (the form's ValidatedAll)
      |           ──► every step complete? ──► Submitting ──► SubmitApplication (1.5s)
      v
view: tabs and menu marked by hasErrors / isComplete, the review, the preview
```

## Run it

```bash
pnpm --filter foldkit-example-foldkit-job-application dev
npx vitest run examples/foldkit-job-application   # from the repository root
```

## Who owns what

| Concern | Owner | Where |
| --- | --- | --- |
| Which step is shown, Next and Previous, the submission and its state | the application, as upstream | `src/model.ts`, `src/update.ts` |
| Each step's and each entry's state, their Messages, adding and removing entries | the step Submodels, placed with `Update.foldChild`, as upstream | `src/step/*` |
| What a validated field accepts, its label and words | the record's schema, read through `Entity.input` (`foldkit-entity`) | each step's `// FORM` |
| Each draft and its state (`NotValidated`, `Validating`, `Valid`, `Invalid`) | `foldkit-form`, as Foldkit's own `fieldValidation` Fields | `model.form` of the step or entry |
| The email check, and dropping an answer for an email since edited | the form's `checks`, with `debounce: 0` | `src/step/personalInfo/personalInfo.ts` |
| Whether a step is complete or shows an error; showing every error on submit | the form (`isValid`, the fields, `ValidatedAll`), read by `src/step/validation.ts` | each step's `// VALIDATION SUMMARY` |
| Pronouns, dates, graduation year, proficiency, files, the step tabs and menu | `@foldkit/ui` components, their choice in the step's Model, as upstream | the steps, `src/view/stepNav.ts` |
| Inputs, textareas, checkboxes, buttons, tabs, radio pills, the calendar | `@foldkit/ui`, drawn through `foldkit-mixins-ui` adapters and the shipped recipes | `src/view/*`, `src/style.ts` |
| Page Slots, layout, theme tokens, layer order, state as data attributes | `foldkit-mixins` | `src/style.ts` |

## What is not used, and why

- **`foldkit-mixins-form`**, which draws a form. Its field is label, control,
  description, error; upstream's has a `◐` or `✓` beside the label, the
  records lay their fields out two to a row between pickers the form does not
  hold, and nothing here submits a form: the application submits all of them
  at once. The views draw each field with `Field.input` over the form's field
  and label.
- **The forms' own submit.** A form's `Submitted` hands over one record's
  decoded value; the application needs every step complete at one moment,
  as upstream's `isApplicationComplete` asks. So a submit reveals each form's
  errors with its `ValidatedAll` and reads `isValid`, and the forms' out
  Message is never sent.
- **Nested forms** (`Relation.nested`) for the entries. A row of a nested form
  holds only the form's keys, and an entry also holds date pickers, a
  listbox or a radio group with state of their own; those stay in the entry,
  and each entry holds its own form.
- **Pickers as form keys** (`Input.bundle`). The pronoun, the dates, the year
  and the proficiency are choices nothing validates; upstream keeps them as
  plain Model fields beside the component's own Model, and so does this port.
  Nor are files: `foldkit-form` has no control for a `File`.
- **`foldkit-bundle`.** The steps and entries are placed with
  `Update.foldChild`, the lift upstream uses; the forms are Bundles, folded
  the same way. A Bundle placement would be a second way to wire them.
- **`foldkit-remote`, `-sync`, `-mirror`, `-surface`, `-agent`, `-crud`, `-ssr`.**
  Nothing is server data, a replicated edit, state for the URL or storage, or
  exposed to an agent. The email check and the submit are fake Commands, as
  upstream's are.

## Differences from upstream

- **Messages.** The per-field `Updated*` Messages and
  `CompletedValidateEmailAsync` are the form's `Changed` and `Checked`, carried
  by each step's or entry's `GotFormMessage`; `emailValidationId` is gone, as
  the form drops an answer for an email since edited. The check is the form's
  Command `PersonalInfo.check`, not `ValidateEmailAsync`.
- **A submit asks about a well-formed email not checked yet** rather than
  taking it as valid, and the notice names Personal Info until the answer
  comes. Upstream's `revealFieldErrors` marks it valid without asking.
- **Each step's `revealErrors` returns Commands** (an `Update.Step`), folded
  like the step's Messages, since revealing may start the email check.
- **A proficiency pill is named by its level.** Upstream spreads the option's
  label attributes on an empty `<input>`, which leaves the radio unnamed.
- **The pronoun and graduation-year lists share one look**, an accent wash on
  the active option and a check on the chosen one; upstream's differ slightly.
- **The success and failure tones.** `Theme.oklch` mixes a tone's `subtle`
  in oklch with a surface that carries the accent's hue, which turned the
  success banner blue; `style.ts` mixes those two in sRGB.
- The look is approximated with a `Theme.oklch` indigo palette, not Tailwind.
  Textareas keep their `rows` (the reset sizes them to their content), and the
  file inputs are hidden from the drop zone, since the `sr-only` class
  `@foldkit/ui` gives them names a Tailwind utility.

## Tests

From the repository root: `npx vitest run examples/foldkit-job-application`.

- `test/story.test.ts`, `test/scene.test.ts` and `test/step/**` are upstream's
  stories and scenes, driven through the forms' Messages
  (`test/fixtures.ts`), plus: every required and pattern message, optional
  keys emptied, the check's answers, a chosen pronoun, the custom pronoun
  field, a submit that asks about an unchecked email, a stale answer and a
  submit leaving the Model or each valid step as it was.
- `test/check.test.ts` runs the real email check and submit Commands on the
  TestClock: 600ms and 1.5s, and not a millisecond before.
- `test/view.test.ts` draws inert what no `h.submodel` holds: the step layout
  on Review in every submission state, the navigation on every step, the
  preview, the cover letter's counter, and a field in every state. Every
  element is in a Slot, every token the styles read is in the stylesheet,
  and the tabs, borders, marks and counter follow the Model.
- `test/runtime.test.ts` and `test/runtime.submit.test.ts` run the real
  runtime in jsdom: every step draws each element with a class, the real
  email check, a position added with a real id, and a complete application
  submitted. An open `@foldkit/ui` popup takes about 35 seconds to draw in
  jsdom (upstream's too), so the popups are covered by Scene and were checked
  in a browser.
