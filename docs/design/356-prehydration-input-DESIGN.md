# Keeping what is typed before the runtime starts (#356)

Status: built (2026-10-30).

## The problem

A server-rendered page is editable as soon as it is parsed, but its script
arrives later. Whatever a person types into a field in that gap is in the
field and nowhere else: the Model the browser resumes holds the value the
server rendered. When `SSR.hydrate` adopts the page, Foldkit re-asserts every
controlled value to the Model's (`hydrate.js`, `isControlledCurrentState`
compares the element's current `value` with the vnode's and marks it stale),
so the text vanishes, the caret with it, and the Model never learns it. On a
slow connection that is the first several keystrokes of a search box.

`examples/foldkit/domains` (upstream) works around it with an inline classic
script, `bootstrap.ts`, serialized into the page: it listens to the search
input, mirrors the value into `?q=` and a few attributes, and the client's
`init` reads the URL back. That works for one field whose value fits a URL,
and costs an inline script (a CSP `script-src` nonce or hash), a second copy
of the field's behaviour in plain DOM code, and a handoff Command that removes
its listeners.

## Who owns what

| Fact | Owner |
| --- | --- |
| What the person typed, until the runtime starts | the field itself (the DOM's current value and selection) |
| Which Message a field's typing becomes | the view, through the field's own resumable `OnInput`/`OnChange` binding |
| Whether a field's early typing is kept | the view, per field (`rh.KeepTyped()`) |
| Carrying it into the Model | `foldkit-ssr`'s `SSR.hydrate`, through the application's `update` |
| The Model afterwards | the application, as for any Message |

## The decision

**No inline script.** The browser already records exactly what matters: a
text field's current value, its selection and its focus survive until the
runtime touches them. `OnInput` and `OnChange` Messages carry the field's
whole value, not a keystroke, so the final value says everything the
keystrokes would have; replaying each keystroke would only replay
intermediate states. Reading the fields when the script runs therefore loses
nothing a recorder would have kept, and there is no inline script, so nothing
for a Content Security Policy to allow and no nonce to thread through the
template.

A field opts in from its view, beside the binding that names its Message:

```ts
rh.input([rh.Value(model.query), rh.OnInput(Message.ChangedQuery), rh.KeepTyped()])
```

1. **Server.** `rh.KeepTyped()` marks the element with the ordinal of its
   resumable `OnInput` binding (else its `OnChange`), as
   `data-foldkit-plus-keep`. A field the page cannot replay is refused
   (`ResumeUnsafe`, reason `UnkeepableField`, naming the element): no data
   binding (a closure, or none), or an element that has no typed value
   (anything but `input`, `textarea` and `select`, and the `input` types
   `checkbox`, `radio`, `file`, `hidden`, `button`, `submit`, `reset`,
   `image`). The marker rides on the element like the binding markers, and
   the first patch removes it.
2. **Browser, when the script runs.** Before anything is adopted,
   `SSR.hydrate` reads each marked field. One whose value differs from what
   the server rendered (its `defaultValue`, or a `select`'s default option)
   becomes its binding's Message with the hole filled from the value, decoded
   through the plan's Message Schema like every binding. These Messages go
   first in the queue a resumable page already has for Messages answered
   before boot, so they reach `update` before anything the page answers
   afterwards, once each.
3. **Boot.** A page with kept typing boots through the deferred path even when
   it starts `now`, because that path hands the queue to the runtime. The
   runtime starts from the resumed Model, so its first render is the served
   page and every node is adopted; it re-asserts the served value into each
   changed field. Just before boot each marked field's value and selection
   are saved, and as soon as the first render commits they are written back,
   before the queue runs. When `update` then sets the Model to that value,
   Foldkit finds the field already holding it and writes nothing, so the
   caret stays where the person left it, and focus never moved: the element
   was adopted, not rebuilt.

### Why not fold the Messages into the starting Model

Starting the runtime from `update(resumed, typed)` would skip the
re-assertion altogether, but the first render would then differ from the
served page wherever the view depends on the value (a clear button, a result
count). Foldkit's hydration walk does not patch such a difference: it clears
the nearest parent's children and rebuilds them, so the very field being
kept is rebuilt, losing focus and caret. Starting from the served Model keeps
the server's guarantee that the first render adopts every node, and the value
then changes through an ordinary patch.

### What is not kept

- **Fields not marked.** Nothing is read or replayed for them: as before,
  hydration re-asserts their served value.
- **Events that are not a value.** A key press or a click before the script
  arrives is the browser's alone; a form submitted then posts, which
  `fallback: 'server'` answers.
- **An IME composition in progress at boot.** The first render's re-assertion
  writes the field, which ends a composition; the composed text is kept as
  typed text. Avoiding that write needs Foldkit (below).
- **A page that is not resumed.** A contained, declined or stale page starts
  from elsewhere, and its fields are not read.
- **A value the browser restored.** A reload or a history visit can refill a
  field before the script runs; it is kept like typing, since it is what the
  field shows.

## Fields in lazy bundles

A lazy bundle's fields are rendered by the server with their bindings lifted
through the placement (`depth`), so their Messages are the parent's and are
filled the same way. Such a page waits for the bodies before it boots, and the
queue is handed over only then, so the bundle's `update` has loaded.

## Upstream

The write-then-restore in step 3 exists because hydration always re-asserts a
controlled value. A hydration option that leaves a control's current state
alone, or reports which controls the person changed, would remove the write
and keep an IME composition intact. Recorded as proposal 6 in
[`upstream-foldkit-ssr.md`](../upstream-foldkit-ssr.md), as a comment for
[foldkit#1784](https://github.com/foldkit/foldkit/issues/1784), which asks
Foldkit for pre-hydration input as a whole.

## Tests

- jsdom (`packages/ssr/test/keepTyped*.test.ts`, `keepFields.test.ts`, with
  `keepTyped.mutations.ts`): a kept field typed before
  hydration ends with the value in the Model and the field, the same element,
  the selection where it was, and `update` given the Message once; an unmarked
  field is re-asserted to the served value; an unchanged field sends nothing;
  a deferred page's later typing follows the early value in order; a `select`;
  the server refusals; a tampered marker contains the page.
- End to end (`examples/foldkit/ssr/e2e/typed.e2e.ts`): the dev server's page
  with its module script held by route interception, typing and a caret move
  in Chromium, then the script released: the field and the Model hold every
  character, the caret is where it was, and typing continues there.
