# Writing documentation: before and after

Pairs from this repository for [`writing-docs.md`](./writing-docs.md). Each
"before" is quoted from a real document as it stood on 2026-11-19. Each
"after" is one way to meet the rule; it is not the only one.

## An opening

**Before** (`packages/media/README.md`, the first paragraph):

> Responsive images for Foldkit Plus. An image is a URL to write: given an
> image's facts, a provider that knows a host's URL scheme, and how wide the
> image is drawn, `foldkit-media` derives every attribute of its markup
> (`srcset`, `sizes`, a `source` per format, the box it reserves, how eagerly it
> loads). It performs no I/O. Icons are its second half: an icon is data
> (`IconData`), read from an SVG file or an Iconify set at build time and
> checked there, then drawn inline or as a mask. Its subpaths add the I/O
> around both: a resizing server, its Cloudflare and Node layers, uploads, and
> Vite plugins.

Seven of our terms, three products and a negation, and no problem.

**After:**

> A photo straight from a camera is several megabytes. Sent as it is, it
> makes a phone download far more than its screen can show, and the page
> jumps when it arrives. Doing it properly means a smaller file for each
> screen width, a modern format with a fallback, the right `srcset` and
> `sizes`, and the image's box held open while it loads.
>
> `foldkit-media` does that work for you. Import an image from your
> repository and your build writes every size and format; hand the result to
> `Image.view` and the page gets the markup.

*Rule:* the first screen names a problem the reader has, before any name of
ours.

## A term introduced

**Before** (`packages/mixins-ui/README.md`, line 5):

> **Adapters** take a component `@foldkit/ui` already owns, name its attribute
> bundles as typed `foldkit-mixins` Slots, and run the Mixins resolver over
> them, so a caller styles or decorates the component without copying its
> markup or merging attribute arrays by hand.

Adapter, attribute bundle, Slot, Mixins and resolver, in one sentence, none
explained.

**After:**

> Some widgets here are built on `@foldkit/ui`, Foldkit's own unstyled
> components. You cannot reach inside one to add a class to its third
> element, so this package gives each of its parts a name, such as `button`
> or `icon`, and lets you attach a style to the part by name. We call a named
> part a *Slot*, and a wrapper that adds the names to an `@foldkit/ui`
> component an *adapter*.

*Rule:* problem, then the plain idea, then its name.

## A first example

**Before** (`packages/mixins-ui/README.md`, "Sixty seconds: style a Button
without copying it", line 152): an `@foldkit/ui` Button imported as
`UiButton`, a `Style.forSlots(ButtonSlots)` holding `Style.class('btn
btn-primary')`, and `Button.toView([SaveStyle.mixin], { h }, ({ button }) =>
h.button(button, ['Save']))`, followed by "The important line is: `toView:
Button.toView(mixins, { h }, draw)`". It shows the rarest path through the
package (adapting an upstream component with your own CSS classes), uses none
of the package's own looks, and never shows what renders. The package's own
`Button.view` appears 250 lines later.

**After:** the common path, one sentence before and the result after.

> This draws a Save button in the theme's accent look:
>
> ```ts
> Button.view({ label: 'Save', style: SaveStyle, onClick: Message.Saved() }, h)
> ```
>
> The page gets a `<button type="button">Save</button>` with the accent
> colours. Pressing it sends `Saved` to your `update`.

(With the imports, the `Message` and `SaveStyle = Recipes.Button.style({})`
shown above it, and compiled.)

*Rule:* the first example is the common path, small, and followed by what
happened.

## A section heading

**Before:** `## Core concepts` (`packages/mixins-ui/README.md` line 221),
`## The mental model` or `## Mental model` (in 23 READMEs), `## Common workflows`
(`packages/site/README.md`, 250 lines under one heading), `## Example`.

Read in the site's "On this page" list, none says what is under it.

**After:** the question or task the section answers.

- `## Style a widget you did not write` (what "Core concepts: `toView` and
  `resolve`" was about)
- `## Why the filter is in the Model and not the URL` (a mental model, as a
  question)
- `## Add a page`, `## Link to a page`, `## Show a 404` (what "Common
  workflows" held)

*Rule:* headings state the content.

## An option in a table

**Before** (`packages/mixins-ui/README.md` line 408, one cell of the Button
row, about 600 characters):

> Adapter over `@foldkit/ui`'s Button. `Button.view({ label, style, type?,
> disabled?, invalid?, busy?, pressed?, icon?, trailing?, description?, mark?,
> href?, external?, words?, onClick?, attributes?, mixins? }, h)`;
> `Button.toView` for your own `draw`. `disabled` writes `aria-disabled`, not
> `disabled`; `pressed` makes it a toggle (`aria-pressed`); an `icon` draws
> before the label, hidden from assistive technology. A button presses or it
> is a link: `href` draws an anchor and takes no `type` or `onClick`.

The signature is generated on the API page already; the cell restates it and
hides the meaning of each option in a run-on.

**After:** what it does, when you would set it, the default, one row each.

| Option | What it does | Default |
| --- | --- | --- |
| `disabled` | Shows the button as unavailable; it stays focusable. Refuse the action in `update` too. | `false` |
| `busy` | Marks it as working and ignores presses, e.g. while a save is in flight. | `false` |
| `pressed` | Makes it a toggle that reads as on or off. | not a toggle |
| `href` | Draws a link that looks like a button, for navigation. | a button |

Why `disabled` writes `aria-disabled` rather than `disabled` (a submit button
still submits on Enter) is a paragraph under its own heading, not a clause in
a cell.

*Rule:* options say what, when and default; no cell over 100 characters.

## A failure

**Before** (`packages/mirror/README.md`, the cookie section):

> `setCookie(model, request)` is the `Set-Cookie` value for the slice of
> `model`, or one that clears the cookie when the slice is at its defaults. It
> sets nothing itself; the answer's headers carry it. It is `None` when the
> slice encodes past `maxBytes`, and the browser keeps what it held; a browser
> write past it is skipped and reported as `CookieTooLarge`.

The failure is the last clause of a definition. Nobody whose cart stopped
being remembered will find it.

**After:**

> ### The cart stops being remembered once it grows
>
> A browser keeps at most about 4 KB per cookie, so the mirror stops writing
> one that would be larger (`maxBytes`, 4096 by default). The cookie keeps its
> last value, and the mirror reports a `CookieTooLarge` warning through
> `Diagnostics`.
> Keep less in the cookie (only the cart's ids, say), or move the slice to
> `Mirror.kv`.

*Rule:* a failure is documented by its symptom first.

## Voice

**Before** (the first draft of the 0.41 post, `git show
a32b4476e:docs/release-0.41.0.md`):

> None of these calls performs I/O. The recipe and `configure` run once, at
> module scope, and hold no state. The Bundle holds no view, and its Model
> lives in yours.

**After** (the published post):

> `Table.configure` takes the arguments that never change and gives back a
> `view` that needs only what differs.

*Rule:* say what happens, not what does not.

## Evidence

**Before** (the first draft of the 0.41 post):

> Placing a Bundle is optional. Folding a widget's `init` and `update` by hand
> adds nothing to the page; the first placed Bundle costs about 6 kB brotli,
> shared by every later one ([both ways](…)).

**After** (the published post):

> A page that draws a breadcrumb trail is 27.8 kB lighter in 0.41, compressed
> with brotli. … The breadcrumb figure is held by a test that fails if the
> menu reaches a plain trail page again. … The 136-byte figure was measured
> once and no test holds it.

*Rule:* evidence plainly, with its source, including when the source is weak.

## An ending

**Before** (`packages/host/README.md`, the last lines):

> - No preset. A Worker writes its `Host.routes` call itself; a one-call
>   preset over these parts is deferred until several applications share the
>   same glue.

**After:**

> ## Next
>
> - Serve pages rendered on the server: [`foldkit-ssr`](…).
> - Sign people in: [`foldkit-auth`](…).
> - A whole Worker built from these parts: [`examples/reference`](…).

*Rule:* every page ends with where to go next.
