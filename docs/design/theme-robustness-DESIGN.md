# Theme robustness design: the right theme in the first frame

Status: built, 2026-10-20: `Theme.knobScript`/`chooseKnobs`, `Themes.script`/`choose`,
the site's previews on them, and the `foldkit-ssr` README's section. Building it
corrected §5 (the view cannot draw `<html>`) and dropped the site's move to
`foldkit-mirror` (§6). Written 2026-10-20. Code here is a sketch against
today's APIs and has not been compiled; names marked *probe* rest on browser or
library behaviour to check before building on it.

## 1. The problem

A reader who chose a theme should see it in the first frame of every page, not
the default theme followed by theirs. Foldkit Plus applies three theme facts,
and only one of them gets this right today:

| Fact | Where it lives | Applied | First frame |
| --- | --- | --- | --- |
| Light or dark (`Scheme`) | `localStorage`, `SCHEME_KEY` | `schemeScript()` in the head sets `color-scheme` on `<html>` | right |
| A named theme (`Themes.make`) | the Model; any storage is the application's | `Themes.apply`, a Command, sets `data-theme` on `<html>` | default until the Command runs |
| Free knob values (the site's `/create`) | the address and `localStorage` (`foldkit-site-theme`) | the view writes them inline on each preview frame | default until `boot` reads them |

The site shows the third: a page is prerendered in the default theme, the
browser resumes that Model, and `ReadThemeAddress` (a `boot` Command,
`examples/site/src/main.ts`) reads the stored theme a moment after the first
paint. A smaller case shows in the scheme switch: the page is right, but the
switch shows "System" pressed until `ReadPageScheme` runs.

## 2. The constraint everything follows from

`foldkit-ssr` keeps one rule: **the browser's first Model renders the page the
server sent** (`packages/ssr/README.md`, "The mental model"). `SSR.render` draws
the view from both sides and refuses a plan where they differ.

So the theme in the first frame is whatever the server knew when it rendered:

- **Rendered per request** (`SSR.entry`, `SSR.handle`), the server can know it,
  from a cookie. The theme is then in the Model and the plan's slice, and the
  first frame is right by construction (§5).
- **Generated at build time** (`SSR.generate`, the site on Cloudflare Pages),
  there is no reader at build time, so every page is drawn in the default. No
  change inside the application can fix the first frame. The page's script
  runs after the document is parsed, by when the browser may have painted, and
  changing the Model before resuming would break the rule above.

What runs before the first paint on a static page is a script in the head,
before any stylesheet. `schemeScript` is that, and it is why the scheme is
right. The design extends it to the other two facts.

## 3. Ownership

One owner per fact, as everywhere in Foldkit Plus:

```text
Model owns the theme            (the active name, the knob values, the scheme)
  |
  | a Command, on the Message that changed it
  v
storage + the applied form      (localStorage / a cookie; <html> attribute, a managed <style>)
  ^
  | the head script, before the first paint, from storage only
  |
cold load
```

- The **Model** owns the theme. `update` changes it through a Message, as now.
- **Storage** is a representation, as `foldkit-mirror` defines one: losing it
  costs a preference, nothing more. `Mirror.kv` restores the Model from it (§6).
- The **applied form** is the DOM the theme takes: `color-scheme` and
  `data-theme` on `<html>`, and for free knobs one managed `<style>` element.
  The head script writes it once from storage. After that only the Command
  that applies the Model's theme writes it, and each write replaces the last.
  So the head script and the Command share one representation, and nothing
  needs undoing when the application takes over.

The head script never touches the application's root, so the resumed markup
still matches the server's, and the rule in §2 holds.

## 4. The static route: a head script per fact

### 4.1 The pairs

`foldkit-mixins/theme` already ships the pair for the scheme: `schemeScript(key)`
for the head and `chooseScheme(scheme, key)` as a Command's effect. Each other
fact gets the same pair with the same signature shape:

```ts
// The scheme (exists).
schemeScript(key?)                     // head: color-scheme on <html>
chooseScheme(scheme, key?)             // Command effect: apply and keep

// A named theme (new).
Themes.script(themes, key?)            // head: data-theme on <html>, if the stored name is one of themes.names
Themes.choose(themes, name, key?)      // Command effect: Themes.apply, and keep the name

// Free knobs (new).
Theme.knobScript({ key?, selector? })  // head: the stored declarations into the managed <style>
Theme.chooseKnobs(theme, { base, key?, selector? })  // Command effect: write the managed <style>, and keep it
```

`Themes.choose` is `Themes.apply` plus storage. Keep `apply` for an application
that stores nothing, so there are not two ways to apply a theme, only one with
storage and one without.

### 4.2 What a named theme's script does

It reads the stored name and sets the attribute only when the name is one of
`themes.names`, which the script carries as a literal. A stored name that a
later build removed is ignored, and the page shows the initial theme. The
attribute is exactly what `Themes.apply` writes, so when the Model is restored
and the Command applies it, the write is the same.

### 4.3 What the knob script does

Free knobs are values, not a name, so the script needs their CSS. Deriving it in
the script would copy `Theme.make` and the knob derivations into a few hundred
bytes of inline JavaScript, and the copy would drift from the real one. Instead:

- **`chooseKnobs` stores the result, not the recipe.** It computes
  `Theme.variables(theme)`, keeps the variables that differ from `base`'s, and
  stores them as JSON: `{ v: <format version>, d: [[name, value], …] }`.
- **The script only applies them.** It reads the entry, drops it unless `v`
  matches, and for each pair whose name starts `--fk-knob-` calls
  `style.setProperty(name, value)` on one rule, `selector { }` (default
  `:root`), in a `<style data-fk-knobs>` element it creates. `setProperty`
  takes one value, so stored text cannot open another rule.
- **The rule is unlayered.** Every rule `Style.stylesheet` writes is in a layer,
  and an unlayered rule beats every layer, so the stored knobs win over the
  theme layer's defaults. Inline styles still beat it.
- **`chooseKnobs` writes the same element.** Each call replaces the rule's
  declarations (creating the element if the script did not), then stores them.
  The head script and the Command are one writer, at different times.

The format version is bumped whenever a knob is renamed or its value changes
meaning. An old entry is then ignored rather than applied wrongly.

### 4.4 Failure handling

- **Storage throws** (a private window, a blocked origin): every script wraps
  its read in `try`, and the page shows the default. A Command that cannot store
  still applies the theme to this page, as `chooseScheme` does.
- **Stored junk**: a name not in the list, an entry with the wrong version, or
  JSON that does not parse is ignored as a whole.
- **Another tab changes the theme**: a `storage` event on the key can send a
  Message, so this tab follows. That is a Subscription the application opts
  into, and `Mirror.kv` is the natural place for it (§6).
- **A page prerendered by speculation rules** runs its head script then, and
  storage is readable from a same-origin prerender (*probe*), so an activated
  page is already right.
- **Content Security Policy**: inline scripts need a `script-src` hash. The
  scripts are fixed text per key, so a build can print their hashes beside
  them.

### 4.5 What the head script cannot do

- **Decode a shared link.** On the site, a `?accent.hue=30` link names a theme
  through the address codec, a Schema decode too large for a head script. When
  the address names a theme other than the stored one, the first frame shows
  the stored theme (or the default) and `boot` corrects it. Shared links are
  rare, and the reader just opened a new theme, so one corrected frame is
  acceptable.
- **Change the Model.** Anything the view draws from the theme, such as the
  site's "Previews are drawn in the theme you made" notice, appears at `boot`.
  The notice now keeps its place hidden, so it moves nothing when it appears.
- **Fix the scheme switch's pressed button.** The page is right, but the
  switch draws from the Model. A small rule can show the right button before
  boot from what the script set: `:root[style*="color-scheme: dark"]` is
  fragile, so the scheme script should also set `data-scheme` on `<html>` for
  such a rule to read (*decide in §10*).

## 5. The served route: a cookie through `flags`

An application that renders per request needs no head script. The fact goes
into the Model on the server:

```ts
// entry.server.ts (sketch)
import { Cookies } from 'effect/http'

export const { renderPage } = SSR.entry(config, Plan, {
  buildId,
  flags: request => ({
    theme: decodeTheme(Cookies.parseHeader(request.headers.get('cookie') ?? '')['theme']),
  }),
  headers: () => ({ 'cache-control': 'private, no-store', vary: 'cookie' }),
})
```

1. **The cookie in.** `flags: request => …` is given the Web `Request`.
   `Cookies.parseHeader` (`effect/http`) reads the header; `decodeTheme` is a
   Schema decode that answers the default for a missing or invalid value, so a
   bad cookie never fails a render.
2. **Into the Model.** `init` reads the theme from its Flags.
3. **In the plan's slice.** The theme must be in `state`, or the browser
   resumes the default. Leaving it out is not silent: the view reads a field the
   slice does not carry, and `SSR.render` refuses the plan.
4. **The view draws what it owns; `<html>` still needs the head script.** The
   theme is in the first Model, so whatever the view draws from it is right in
   the first frame. But `Themes` shows a theme by `:root[data-theme]` and the
   scheme is `color-scheme` on `<html>`, and a view renders the application's
   root only. So the host's template still carries `Themes.script` and
   `schemeScript` (static text, the same for every request), the keeping
   Command writes storage beside the cookie, and the plan's `boot` applies the
   Model's theme, so refused storage costs one frame. (This step first said
   the view draws it all with no script; building the README showed it cannot.)
5. **The cookie out.** The Command that keeps the theme writes the cookie
   (`document.cookie`, `Path=/; Max-Age=31536000; SameSite=Lax; Secure`), next
   to or instead of `localStorage`. It is not `HttpOnly`, because the page
   writes it, and it holds the smallest form: a theme name, or the address
   query (well under the 4 KB cookie limit). A server action that sets it with
   `Set-Cookie` is an alternative for pages that work without scripts.
6. **The cost.** A page that varies by cookie cannot be shared in a CDN cache.
   `private` and `Vary: Cookie` say so. For a page that is already one
   visitor's (signed in), nothing is lost.

## 6. Where `foldkit-mirror` fits

`Mirror.kv` restores a Model slice from a `KeyValueStore` at cold load and
writes it back as it changes. It fits an application whose theme is a field it
can mirror as is: a named theme, a scheme.

It does not replace the site's hand-written `ReadThemeAddress`, `rememberTheme`
and `writeThemeAddress`, as this section first said. The site's address is a
readable query of one parameter per knob (`?accent.hue=145&type.body=mono`),
and reads the flat names of older links; `Mirror.url` writes one key per Model
field, so the theme would become one encoded parameter and every shared link
would break. Its precedence is its own too: the address wins only when it
names anything, and is written only on `/create`. The site keeps its code.

It restores in `boot`, after the first paint, so it never fixes the first frame
on its own. The division:

- `Mirror.kv` makes the Model right after boot, and keeps storage in step.
- The head script makes the first frame right, from the same key.

Both must read one key in one format. Either `chooseKnobs` is the mirror's
writer for the knob entry, or the mirror stores the values and `chooseKnobs`
stores the declarations under a second key. §10 asks which.

## 7. A third route: rewrite the cached page at the edge

A static page can still be personalized in front of its cache. A Cloudflare
Pages Function reads the cookie and, with `HTMLRewriter`, writes the theme into
`<head>` (an attribute on `<html>`, or the managed `<style>`) as the cached page
passes through. The HTML stays cached and works without scripts. It costs a
Function call on every page request, a cookie, and a deployment to maintain. It
fits a static site that must work without scripts. The site needs scripts, so
the head script is the simpler choice there.

## 8. Rejected

| Option | Why not |
| --- | --- |
| Hide until loaded (`opacity: 0` until boot) | Swaps a flash for a blank page and delays the first meaningful paint. |
| IndexedDB | Asynchronous: a head script cannot wait for it. |
| `sessionStorage` for the theme | Lost when the tab closes. It suits per-tab state, as the site's rail scroll uses it. |
| One generated page per theme | Free knobs have endlessly many themes; named themes multiply every page by their count. |
| Reading storage into the Model before resuming | The page's script runs after the browser may have painted, and a changed Model breaks the rule in §2. |
| Remove a head-script rule at boot | Two representations with a hand-off: miss the hand-off and "Use the default" leaves the old theme showing. One element written by both (§4.3) has no hand-off. |
| Client hints (`Sec-CH-Prefers-Color-Scheme`) | Server-only, Chromium-only, and it only answers system light or dark, which `light-dark()` already follows with no script. |

## 9. Changes

**`foldkit-mixins/theme`**

- `Themes.script` and `Themes.choose`, beside `Themes.apply`.
- `Theme.knobScript` and `Theme.chooseKnobs`, with the stored format and its
  version.
- `schemeScript` also sets `data-scheme` on `<html>`, if §10 says so.
- README: a "The first frame" section showing the three pairs and which head
  each goes in.

**`foldkit-ssr`**

- README: a "Per-reader preferences" section. The cookie through `flags`, the
  slice, the headers, and for `SSR.generate` a pointer to the head scripts
  through the generator's `head` option. Nothing in the package changes: a
  "browser-local fields" feature would either break the rule in §2 or still run
  after the first paint.

**`examples/site`**

- `head` adds `Theme.knobScript({ key, selector: '[data-size]' })` beside
  `schemeScript()`.
- The view stops writing knob declarations inline on each preview, and
  `chooseKnobs` writes the one managed rule instead. That also replaces dozens
  of identical inline styles in the gallery with one rule.
- The theme's Model side keeps its own code (§6).

**`examples/foldkit/ssr`** (or a new small example)

- A named theme kept in a cookie and rendered per request, as the reference for
  §5.

**The `foldkit-plus` skill**

- `references/mixins.md` gains the new pairs, and `references/ssr.md` gains the
  cookie route.

## 10. Open questions

1. **One key or several?** The scheme, a named theme and knobs could share one
   stored entry and one head script, which is smaller. Separate keys keep each
   pair independent and match `schemeScript` as shipped. **Decided: separate**
   (`SCHEME_KEY`, `THEME_KEY`, `KNOBS_KEY`).
2. **Mirror's format.** Does `chooseKnobs` write the mirror's entry (one key,
   declarations only, so the Model's values must be re-derived, which they
   cannot be), or does the mirror store values and `chooseKnobs` store
   declarations under a second key? **Decided: two keys.** The site keeps its
   address query for the Model (`foldkit-site-theme`) and the declarations for
   the first frame (`foldkit-site-knobs`).
3. **`data-scheme`.** Setting it lets CSS show the scheme switch right before
   boot, at the price of a second root attribute that `chooseScheme` must keep
   in step. Worth it only if more than the switch reads it. **Not built**: the
   switch alone reads it, and it corrects itself at `boot`.
4. **The cookie route for named themes only?** Knob declarations in a cookie
   are large. The served route could support named themes and the scheme, and
   leave free knobs to static pages. **Decided: yes.** The `foldkit-ssr` README
   shows a named theme; free knobs stay a static page's.

## 11. Testing

The claim is about the first frame, so the tests must look at the page before
the application boots:

- **An end-to-end test with the script blocked.** Playwright fulfils the page's
  module script with an empty body (`page.route`), so the application never
  boots. With a theme stored, it reads the preview's computed colors, and they
  must be the stored theme's. With storage empty or junk, they must be the
  default's. Then it lets the script through and checks the colors do not
  change at boot.
- **Unit tests per script.** Run the script text against a fake `document`
  and `localStorage`: the attribute is set for a listed name and not for an
  unlisted one, an entry with the wrong version is ignored, a name outside
  `--fk-knob-` is dropped, and a throwing `localStorage` leaves the page alone.
- **Escaping.** A key holding `</script>` is escaped the way `schemeScript`
  escapes `<` today.
- **The served route.** An `SSR.handle` test with a cookie renders the stored
  theme; one with an invalid cookie renders the default; one whose plan leaves
  the theme out of the slice is refused.

As built: the end-to-end test (`examples/site/e2e/theme.e2e.ts`) blocks the
entry script and reads the stored hue on the preview. Its empty-storage case
asserts only that no kept-knobs rule is written, because the dev server styles
pages from their script and so has no default theme to show while the script
is blocked; the build writes the stylesheet in the head. The served route has
no test of its own: the README's cookie snippet was compiled, and the example's
count already runs cookie, Flags, `init` and slice end to end.
- **Mutations** for each guard: the version check, the name filter, the names
  list, the `try`.

## 12. Build order

1. `Theme.knobScript` / `Theme.chooseKnobs`, and the site moved onto them, with
   the blocked-script e2e test. This is the visible fix.
2. `Themes.script` / `Themes.choose`.
3. ~~The site's Model side onto `Mirror.kv` and `Mirror.url`.~~ Dropped (§6).
4. The `foldkit-ssr` README section and the cookie example.
5. The skill's references and the changelog.
