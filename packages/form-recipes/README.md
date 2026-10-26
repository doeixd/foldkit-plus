# foldkit-form-recipes

Field recipes for [`foldkit-form`](../form/README.md). A recipe is what one kind
of key means: a **control**, which reads a draft into the key's value and shows a
stored value as a draft, and a **display**, which reads the value in a list or a
detail. Both are made from the same options, so a date reads the same in its
field and in its table cell, and the parsing that is easy to get quietly wrong
(a date typed month-first, a time the clocks skip) is written once.

## What it owns

| Fact | Owner |
| --- | --- |
| The key's schema, and so what a valid value is | your input schema |
| The drafts, their validity, and the submit | `foldkit-form` |
| How a draft becomes a value and a value a draft; how a value reads in a list | **this package** |
| The element that edits it | `foldkit-form-recipes/html` (or your own renderer) |

A recipe owns no state and sends no Message, except `image`, whose control
holds its upload (below). It attaches where any control does: a form's `inputs`, or Entity metadata through `Input.of` and `Display.of`.

## Mental model

```text
stored value --format--> draft (what the input shows)
draft (typed) --parse--> value --schema--> valid, or the key's error
```

`format` runs only when the form is filled, never on a keystroke, so the caret
and a composition survive typing. A draft `parse` cannot read is the recipe's
own error (`Enter a date`); an empty one is the form's (`Required`, or nothing
for an optional key).

## Install

```sh
pnpm add foldkit-form-recipes foldkit-form foldkit-crud
# and, for the plain renderers:
pnpm add foldkit-mixins-form
```

## Sixty seconds

```ts
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { FieldRecipes } from 'foldkit-form-recipes'
import { renderers } from 'foldkit-form-recipes/html'
import { FormView } from 'foldkit-mixins-form'
import { CalendarDate } from 'foldkit/calendar'

const due = FieldRecipes.date()
const startsAt = FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' })

const Meeting = Form.make(
  'Meeting',
  Form.input(Schema.Struct({ due: CalendarDate, startsAt: Schema.String })),
  { inputs: { due: due.control, startsAt: startsAt.control } },
)

const View = FormView.define(Meeting, { renderers: renderers() })
```

`due.control` and `startsAt.control` are plain `foldkit-form` controls: they do
no I/O and hold no state. `renderers()` draws them as `input type="date"` and
`type="datetime-local"`, named by their keys, so a post without scripts carries
the drafts. Filled with `{ due: Calendar.make(2026, 7, 1), startsAt:
'2026-07-01T08:30:00.000Z' }`, the inputs read `2026-07-01` and
`2026-07-01T09:30`, London being an hour ahead in July; typing `2026-07-01T09:30`
submits `'2026-07-01T08:30:00.000Z'`.

## The recipes

### `date(options?)`

A key whose value is a `CalendarDate`: `Calendar.CalendarDate`, or
`Calendar.CalendarDateFromIsoString` to store it as text. The draft is the
`YYYY-MM-DD` a date input writes. Anything else, a partly typed date, a day
first, or 30 February, reads `Enter a date`.

### `dateTime({ stored, zone?, locale? })`

A date and a time, stored in one of two forms, chosen explicitly:

- **`stored: 'local'`**: the key's value is the wall-clock text a
  `datetime-local` input writes (`2026-10-26T09:30`), in no zone. It is kept as
  typed, so a stored value comes back unchanged. Use it for a time that means a
  clock reading wherever it is read: a shop's opening hour.
- **`stored: 'instant', zone`**: the value is an ISO instant with an offset, and
  the draft is what the clocks in `zone` (an IANA name such as `Europe/London`)
  read at it. A submitted value is written as `Date.prototype.toISOString` writes
  one; any offset is read. An unknown zone throws when the recipe is made.

The zone is a parameter, never the runtime's, so a server and a browser fill the
same text. To follow the person's own zone, pass it:
`Intl.DateTimeFormat().resolvedOptions().timeZone`.

`locale` (default `en`) is what a display says the value in. It changes no
draft: the inputs' text is the same in every locale.

### Text-shaped keys

Each keeps what was typed, unchanged: none trims, lower-cases or rewrites it.
Their renderers give the input its type, what the browser may fill it with, and
turn off capitalization and spelling correction where a correction would be a
wrong address.

| Recipe | Takes | Input |
| --- | --- | --- |
| `email({ autocomplete? })` | one `@`, something either side, no space; else `Enter an email address` | `type="email"`, `autocomplete="email"` |
| `url({ protocols?, autocomplete? })` | an address that parses with a scheme in `protocols` (default `https:`, `http:`), so `javascript:` is refused | `type="url"` |
| `tel({ autocomplete? })` | anything: a number is too varied to check without refusing a real one, so leave it to the schema | `type="tel"`, `inputmode="tel"` |
| `password({ purpose })` | anything | `type="password"`, `autocomplete` `current-password` or `new-password` |
| `slug(from, { prefix?, through? })` | anything | a text input after `prefix` |

A `slug` follows the key `from`, made into a slug by `through` (default
`FieldRecipes.slugify`: lower case, unaccented, `ß` as `ss` and `ı` as `i`, words
joined by `-`; a script with no Latin spelling, such as `東京`, leaves nothing,
so such a title's slug is written by hand), until the
person writes it; a form filled with a stored slug does not follow, so a
published address does not move because its title did. Its control is a
`ControlChange`, which only a form's `inputs` takes.

A `password` never shows in a list (its display is hidden) and has no reveal
toggle: whether the text shows is state the form does not hold, and
`foldkit-mixins-ui`'s `PasswordInput` keeps it in the application. Keep a
password out of any saved draft: a form cannot leave a key out of `partial()`,
so that rule is the application's.

### Amounts: `money`, `decimal`, `percent`

```ts
const price = FieldRecipes.money({ currency: 'EUR', unit: 'minor', locale: 'de-DE' })
const weight = FieldRecipes.decimal({ scale: 3 })
const discount = FieldRecipes.percent({ unit: 'fraction' })
```

An amount is read and shown as `locale` writes it, and built from its digits, so
no floating point stands between what was typed and what is stored:

- **`money({ currency, unit, locale?, negative? })`**: `unit: 'minor'` stores an
  integer of the currency's smallest unit (`123456` for 1.234,56 €), `'decimal'` a
  decimal text (`'1234.56'`); the key's schema says which, and a value of the other
  form fails the fill rather than being converted. The currency sets the decimals:
  none for JPY, three for KWD. A filled field shows `1.234,56 €`, and typing
  `1.234,56` or `1234,56` reads the same.
- **`decimal({ scale, locale?, negative? })`**: a number with at most `scale`
  decimals.
- **`percent({ unit, scale?, locale?, negative? })`**: shown as `12.5%`, stored as
  the share (`unit: 'fraction'`, `0.125`) or the points (`'points'`, `12.5`).

What is refused rather than guessed at: grouping other than the locale's (`12,3`
in `en-US` is not `123`, and `12.3` in `de-DE` is not either), more decimals than
the scale (never rounded), a minus unless `negative: true`, a space inside an
amount where the locale groups with none, a symbol anywhere but at either end,
a minor amount past what a JavaScript number holds exactly (use `'decimal'` for
those), and a `decimal` or `percent` a JavaScript number would round. A partial
amount (`-`, or `1,2` in `en-US`) reads `Enter an amount`: the form checks a key
as it changes. What a keyboard types for what a format writes is read alike: `¥`
for `￥`, `'` for the Swiss `’`, full-width digits, and the bidi marks an rtl
locale writes around an amount are not part of it. The inputs are text with a numeric keypad (`inputmode`), since `"4."`
is a fine draft that `type="number"` would refuse to report.

### Drawn through `foldkit-mixins-ui`

`foldkit-form-recipes/ui`'s `renderers({ input? })` draws the same native inputs
under `foldkit-mixins-ui`'s Input Slot, for a form drawn with
`foldkit-mixins-form/ui`'s table:

```ts
import { renderers as uiRecipes } from 'foldkit-form-recipes/ui'
import { Style } from 'foldkit-mixins'
import * as UiForm from 'foldkit-mixins-form/ui'
import { InputSlots, Recipes } from 'foldkit-mixins-ui'

const input = Style.forSlots(InputSlots)(Recipes.Input())
const UiView = FormView.define(Meeting, {
  renderers: { ...UiForm.renderers({ input }), ...uiRecipes({ input }) },
})
```

The inputs, their names and their Messages are the plain ones; only the look is
the Input recipe's. A calendar in a popover is not one of them yet: it holds an
open month and a focused day, state a renderer has nowhere to keep, so it waits
for a control backed by a Bundle.

### An image: `foldkit-form-recipes/image`

`image({ id, url?, headers?, words?, styles? })` is a key whose value is the
`HashedAsset` that `foldkit-media`'s upload route answers. Its control is a
Bundle, because an upload has state of its own:

```text
Empty --choose--> Sending --201--> Kept (the value)
                  Sending --cancel--> Empty
                  Sending --refused--> Refused --retry--> Sending
                                       Refused --choose--> Sending
Sending, Refused, Kept --remove--> Empty
```

```ts
import { image } from 'foldkit-form-recipes/image'
import { HashedAsset } from 'foldkit-media'

const cover = image({ id: 'cover' })
const Post = Form.make('Post', Form.input(Schema.Struct({ cover: HashedAsset })), {
  inputs: { cover: cover.control },
})
```

Choosing a file (dropped, or picked through the drop zone's input) sends it at
once with `foldkit-media/browser`'s `upload`. The control draws its progress and
a Cancel button, which ends the send's Subscription and so aborts the request.
A refusal shows the route's reason (`words.refused`) with Try again, which
sends the same file again. Only `Kept` is a value: a file on its way, or
refused, is nothing entered, so a required key stays `Required` until the
route has kept it.

`id` is the drop zone's, and its file input's, so it is unique on the page.
Who may upload stays the route's `UploadPolicy`, which a page's session cookie
answers; `headers` is only what the request carries, fixed when the recipe is
made, so never a secret. A dropped file that is no image is refused here, as
`Unsupported`, before its bytes go anywhere. The state is the root's
`data-upload` (`Empty`, `Sending`, `Refused`, `Kept`); the key's label names the
group the control is drawn in; the status is one live region, said once per
state (the progress moves under it); and a press that takes its button away
moves focus on: Cancel and Remove to the file input, Try again to Cancel. Its look comes from `styles.field` (over `ImageSlots`) and
`styles.drop` (over `foldkit-mixins-ui`'s `FileDropSlots`), its words from
`words`. The entry needs `foldkit-media`, `@foldkit/ui`, `foldkit-mixins` and
`foldkit-mixins-ui` beside the package's own; `./ui` needs `foldkit-mixins`,
`foldkit-mixins-ui` and `foldkit-mixins-form`, and `./html` `foldkit-mixins-form`.

**A submit while a file is on its way** waits for it (the control is `busy`
while `Sending`): the key reads as being checked, the form says
`words.checking` under it, and the submit goes out with the image once the
route keeps it. A cancel or a refusal ends the wait with nothing submitted, a
required key then saying `Required`. In `vite dev`, a
Model holding a `File` cannot be kept across a reload, so a send on its way is
lost by one.

## Displays

Each recipe's `display` is a `foldkit-crud` Display, for a list or a detail:

```ts
Entity.annotateMembers({ due: Display.of(due.display) })
```

`date({ locale: 'de' }).display` reads `make(2026, 3, 5)` as `05.03.2026`; an
instant reads in its recipe's zone.

## Failure and edge semantics

- **A time the clocks skip is refused.** In `instant` mode, `2026-03-29T01:30` in
  London names no instant (the clocks go from 01:00 to 02:00), and reads
  `Enter a date and a time that exists`, the words for any draft that names no
  time, a partly typed one too. A browser's `new Date` would move it an hour on
  without saying.
- **A year under 100 is that year.** `0050-06-01` is not read as 1950, as
  `Date.UTC` would.
- **A time the clocks repeat reads as the earlier.** `2026-10-25T01:30` in London
  happens twice; it submits `00:30Z`, the first.
- **A fill with a value of the wrong form throws,** naming the form and the key: a
  `CalendarDate` key given a string, local text in an `instant` key. That is a
  wiring mistake, so it fails at once rather than showing nothing.
- **An empty `Schema.String` key submits `''`.** The empty draft is the form's,
  and a plain string schema accepts it. Give a moment that must be set a schema
  that refuses it: `Schema.String.check(Schema.isMinLength(1))`.

- **An image control's draft is not stored mid-send.** A `File` cannot be
  kept in a stored draft, so `settled` turns `Sending` and `Refused` into
  `Empty`; a kept image stays.
- **A late answer is ignored.** Every send has its own attempt number, and an
  event from a send cancelled or replaced changes nothing.

## Limits

- An email or web address that passes is well-formed, not known to exist: whether
  it receives mail or answers is the server's to find out.

- No arithmetic across zones and no zone-aware value type: an instant is text,
  and its zone is the recipe's.
- A browser's own date and time inputs are the default renderers; their look and
  their picker are the browser's.
- `image` is a Bundle control, so it takes no `check` and cannot sit in a row of
  a nested form. There is no `file` recipe: the upload route takes images
  alone.
