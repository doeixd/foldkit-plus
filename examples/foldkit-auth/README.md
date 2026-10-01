# Auth

Sign in, see a dashboard and settings, sign out. The Model is `LoggedOut |
LoggedIn`, each side a Submodel that tells the root about a login or a logout
through an OutMessage. Protected routes send a logged-out visitor to Sign In,
Sign In sends a logged-in one to the dashboard, and the session survives a
reload through localStorage. It ports Foldkit's
[auth example](https://github.com/foldkit/foldkit/tree/main/examples/auth) to
Foldkit Plus.

## Who owns what

The root Model owns which side the visitor is on; each side owns its route and
its page. The login form's drafts and validation belong to
[`foldkit-form`](../../packages/form), inside the Login page's Model; the
request in flight is the Login page's:

```text
type / Enter ──► LoginForm (foldkit-form) ──► Submitted { email, password }
                                                   │
                         Login page: isSubmitting, SimulateAuthRequest (1s)
                            │ failed: form's Refused marks the password
                            ▼ succeeded
          OutMessage SucceededLogin ──► LoggedOut ──► root: LoggedIn + SaveSession + /dashboard
Sign Out ──► OutMessage RequestedLogout ──────────► root: LoggedOut + ClearSession + /
localStorage ──► Flags (decoded) ──► init: which side, and the route guard, before the first frame
```

## Run it

```bash
pnpm --filter foldkit-example-foldkit-auth dev
```

Any email with the password `password` signs in.

| Concern | Owner | Where |
| --- | --- | --- |
| Logged out or logged in, and the move between them | the root Model, a union of two Submodels, as upstream | `src/model.ts`, `src/update.ts` |
| Routes, route guards, redirects | plain Foldkit (`foldkit/route`, `routing`) | `src/route.ts`, `src/update.ts`, `src/main.ts` |
| The Submodel and OutMessage wiring | Foldkit's `Update.foldChild` and `h.submodel`, as upstream | `src/update.ts`, `src/page/*/update.ts`, the views |
| The email and password drafts, their rules and messages, submitting only valid credentials | `foldkit-form` (`Form.make` over `Entity.input`, `foldkit-entity`) | `src/page/loggedOut/page/login.ts`, `// FORM` |
| A sign-in in flight, the fake auth request, the refused password | the Login page (`isSubmitting`, `SimulateAuthRequest`, the form's `Refused`) | `src/page/loggedOut/page/login.ts` |
| Reading the session at start, saving and clearing it | Flags and Commands over `KeyValueStore`, as upstream | `src/main.ts`, `src/command.ts` |
| Accessible input and buttons | `@foldkit/ui` Input and Button | the Login and Settings pages |
| Their look: `Recipes.Input`, `Recipes.Button` | `foldkit-mixins-ui` | `src/style.ts` |
| Page Slots, layout, theme tokens, layer order | `foldkit-mixins` | `src/style.ts` |

### What is not used, and why

- **`foldkit-bundle` placements.** A placement is a field of a parent struct,
  started by its Bundle's `init` from fixed `args`. Here the root Model *is*
  the union: each side replaces the whole Model, and is started by a
  transition with values only known then (the parsed route, the session from
  Flags or from the login). A Bundle would need an `init` that nothing calls.
  The Login page and its form are each placed once, so they are wired by
  `Update.foldChild` as upstream wires every Submodel, rather than two ways in
  one app. The form itself is a Bundle (`LoginForm.bundle`), folded that way.
- **`foldkit-mirror`.** A mirror keeps a top-level field of a struct Model in
  a store and writes it back into that field; it cannot run a transition. The
  session is not a field: restoring it chooses the side of the union and the
  route guard, and must do so before the first frame, which is what upstream's
  Flags do. Saving and clearing are two explicit transitions, login and
  logout, so they stay Commands.
- **The generated form view from `foldkit-mixins-form`.** It would take the page's `isSubmitting` as its
  `submitting` input ("Signing in..." as `words.submitting`), and a
  stylesheet could draw the `✓` from the field's `data-validation`. This
  page keeps its label/mark layout and styled submit button. It uses
  `FormView.fields` with the shared `foldkit-mixins-form/ui` field override,
  so control rendering, blur dispatch and accessibility metadata are not
  reimplemented by the page.
- **`foldkit-surface`, `-remote`, `-sync`, `-agent`, `-crud`, `-ssr`.**
  Nothing reads a projection, caches server data, replicates edits, or is
  exposed to an agent; the auth request is a fake Command, as upstream's is.

## Differences from upstream

- **Submitting an invalid form says what is missing.** Enter, or a click on the
  greyed button (`@foldkit/ui` marks it `aria-disabled`, so it still submits),
  validates both keys: an untouched email reads "Email is required". Upstream
  sends nothing and shows nothing.
- **Messages.** `ChangedEmail`, `ChangedPassword` and `SubmittedForm` are the
  form's `Changed` and `Submitted`, carried by the Login page's
  `GotFormMessage`; the Login Model is `{ form, isSubmitting }`. A failed
  sign-in sends the form's `Refused` for the password, which keeps what was
  typed and clears on the next edit, as upstream's `Invalid` did.
- **A `ChangedUrl` for the route the Model shows returns the same Model.** A
  redirect's `replaceUrl`, or a link to the page shown, comes back as that
  route; upstream wrote it into a copy of the Model and redrew. Nothing shown
  changes.
- **The nav link of the page shown carries `aria-current="page"`**, which is
  what styles it, in place of upstream's conditional class.
- Titles are one exhaustive `AppRoute.match` in place of an `orElse` that
  printed the tag; the strings are upstream's.
- The look is approximated with a `Theme.oklch` blue palette, not Tailwind;
  the hint box uses the theme's `info` tone.

## Tests

From the repository root: `npx vitest run examples/foldkit-auth`.

- `test/scene.test.ts` and `test/page/loggedOut/page/*` are upstream's tests,
  the stories driven through the form's Messages (`test/fixtures.ts`), plus
  an empty submit, a second submit while one is in flight, and the refused
  password.
- `test/update.test.ts`: tables of `init` and `ChangedUrl` for each side and
  route (the guards and redirects), the same Model for the route shown, login
  and logout with their Commands, the logged storage failures, and the titles.
- `test/flags.test.ts`: the Flags over jsdom's localStorage, for a stored
  session, nothing, text that is not JSON, and a session missing a field.
- `test/view.test.ts`: every page drawn inert, each element through a Slot,
  every token the drawn styles read in the stylesheet, the field borders, the
  refused password's description, the submit button in each state, and the
  current nav link.
- `test/runtime.test.ts` and `test/runtime.session.test.ts`: the real runtime
  in jsdom, one per file since a routing runtime cannot be disposed: a
  protected page sending a visitor to Sign In, a failed then a good sign-in
  saved to localStorage, the guard on `/login`; and a stored session restored
  at start and cleared by Sign Out.
