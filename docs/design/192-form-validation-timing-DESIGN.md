# When a form's failures show (#192)

Status: decided and built (2026-10-27), not yet landed. The change to
`foldkit-form` turns nine `foldkit-mixins-form` unit tests red (they blur an
untouched field to make it invalid), and that package is being restyled by
another session, so the form change lands together with their one-line test
updates. The view's half, the list of fields to fix, follows in
`foldkit-mixins-form`. See [Deferred](#deferred).

## The problem

`foldkit-form` validated a key on its first `Blurred` while the key was still
`NotValidated`, whether or not the person had changed it. So:

- Tabbing through an empty required field, without typing, marked it invalid
  and showed `Required`.
- After a quick-add form reset on success (the Cloudflare example's "New
  todo"), focus stayed in the emptied field, and the next click anywhere said
  `Required`.
- `FormView` draws its "Check these fields" list whenever any field is
  invalid. In a one-field form that repeated the inline error just below it,
  in a red box.

The first two scold a person for something they did not do. The third says one
thing twice.

## The rules

```text
edit (Changed, Toggled, a control's value)  ──► validate that key now
leave (Blurred)                              ──► nothing
submit (Submitted)                           ──► validate every key, attempted = true
Validated({ key })                           ──► validate that key now (a program's request)
Reset, fill                                  ──► attempted = false
```

1. **A failure first shows on an edit that makes the key invalid, or on a
   submit.** Leaving a key validates nothing. An edit has already validated
   the key it changed, so the old blur had something to add only for a key
   nobody touched, and that is exactly the case where it should say nothing.
   Emptying a required field you typed in still says `Required` at once, since
   that is an edit.
2. **The list of fields to fix belongs to a submit.** The form records
   `model.attempted` when a submit is asked, and keeps it while the person
   fixes things, so the list shrinks as they do. `Reset` and `fill` clear it:
   the form is about something new. `ValidatedAll` does not set it; the page
   that sends it owns the submit and draws its own errors (the job application
   example does).
3. **`Validated({ key })`** is the old blur, under a name that says what it
   does: check this key as it stands, edited or not. A `fill` validates
   nothing, so a program that shows a stored value's failure (the page
   Builder's inspector, showing a prop that no longer decodes) asks for it.

`model.attempted` decodes as `false` from a Model stored before it existed, so
a CMS draft saved by an earlier version still opens.

## Where a failure is said, and how a screen reader hears it

The form owns the facts; the view decides how they are drawn. What the drawn
packages should do with them:

- **Beside its field, once.** The error text sits under its control, with
  `aria-invalid="true"` on the control and the error's id in its
  `aria-describedby`, so moving to the field reads it. `FormView` does this
  today.
- **Announced when it appears.** An inline error appears on an edit, while the
  person is in the field, so a live announcement is what tells them. The error
  keeps `role="alert"` (today's markup), which is announced on insertion.
- **The list after a submit only.** `FormView` should draw its list when
  `model.attempted` is true and some field is invalid, not whenever a field
  is. Before a submit, the inline error is the only place a failure is said.
- **No list for one field.** A form that draws one control has nothing to
  navigate between; its inline error is the summary.
- **One announcement for a submit.** When the list appears, it carries the
  announcement (`role="alert"` on the list), and the inline errors drawn by
  that same submit drop theirs, so a reader hears the list once rather than
  every field at once.

## Options considered

1. **Blur validates only an edited key** (the issue's proposal), tracked by a
   new `edited` set in the Model. Built first and rejected: since an edit
   already validates its key, an edited key is never `NotValidated` when it
   is left, so the set changed nothing a test could see. It is the state the
   deferred hold below needs, and it should arrive with it.
2. **An option on `Form.make`** (`validate: 'blur' | 'edited' | 'submit'`),
   keeping today's default. Rejected: the default is the behaviour to fix, and
   a second way to time validation is a second thing every view and test has
   to know about. Foldkit Plus is 0.x; the better default ships as the default.
3. **Validate only on submit** (GOV.UK's pattern). Rejected for now: it throws
   away the live feedback every form here relies on (a slug check, a number
   that does not parse), and the drawn packages' tests and examples assert it.
4. **"Reward early, punish late"**: hold a failure while text is typed and show
   it when the key is left, but clear one already shown on the edit that fixes
   it. Built and measured: right for text, and the change most likely to
   follow, but it rewrites the live feedback of every form, the Builder's
   inspector included, and about forty tests across nine packages and
   examples. Deferred, below.

## Deferred

- **The view's half** (`foldkit-mixins-form`): gate the list on
  `model.attempted`, draw none for one control, and move the announcement to
  the list on a submit. Another session owns that package now; the change is
  handed over, not made here. Its unit tests that blurred an untouched field
  to make it invalid now send `Validated({ key })`, or type and clear the
  field.
- **Holding a failure while text is typed** (option 4). It needs the `edited`
  set of option 1, so `Blurred` can tell a key left after typing from one
  passed through. A flag, a list or a control's Model is a choice made by the
  press and should still validate on it.
- **Moving focus on a failed submit** to the list (or, for one control, to the
  field). `FormView`'s submit is a DOM event; focusing on failure needs a
  Command from the form's owner, which the Bundle does not have yet.
