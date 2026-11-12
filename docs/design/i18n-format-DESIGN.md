# Formats: `LocaleFormat.of(conventions)` (i18n step 3)

Status: decided 2026-11-11 (decisions delegated by the owner). F0 is built
(0103c0b); nothing else is. Verdict: **not yet.** Phase F0 fixes three views
that read the runtime's defaults and needs no new API; the formatter itself (F1 to F4) is
gated on [i18n-DESIGN.md](./i18n-DESIGN.md) step 1, because no Model in this
repository holds a locale to give it.

Every claim about current code names its file and line, read on 2026-11-11 at
`5c59081`. Every API below is a sketch: none of it exists or has compiled.

## 1. The problem

i18n-DESIGN's "Formats" section asks for "a small `Format` value built from
the locale (`Format.of(locale).date(iso)`)" so views stop passing a locale and
a time zone everywhere. What formats today:

| What | Where | State |
| --- | --- | --- |
| A cache of `Intl` formatters, written four times | `cms/src/kinds.ts:71-90` (two maps), `form-recipes/src/wall.ts:68-82`, `form-recipes/src/number.ts:194-209` | duplicated |
| A relative-time ladder, written twice | `cms/src/kinds.ts:61-67`, `104-108`; `primitives/src/time/relative.ts:7-23` | they disagree: 90 minutes is "1 hour ago" (truncates) and "2 hours ago" (rounds, and makes a formatter per call) |
| A locale fixed when the Entity is declared | 14 reads of `locale ?? 'en'`: `cms/src/kinds.ts:103`, `105`; twelve in `form-recipes/src/index.ts` (`:62` to `:601`) | cannot follow the Model |
| A view reading the runtime's locale and zone | `cms/src/views.ts:85-86` (`Cms.historyCard`, published); `examples/cms/src/views/view.ts:322` | differs between a server and a browser |
| A view reading the runtime's zone | `examples/chirp/src/view.ts:53` (`'en'`, no `timeZone`; its comment says "the reader's own calendar") | same |
| Counts through `toLocaleString()` | `examples/registry/src/view.ts:84-87`, `ownership.ts:20`, `:56` (six calls); `examples/data-grid/src/main.ts:299` (two) | runtime locale |
| Prices by hand (`toFixed(2)`) | `examples/data-grid/src/main.ts:66`, `examples/site/src/snippets/components.ts:1905`, `:1935` | no locale; `FieldRecipes.money` already does this |
| Fixed on purpose | `mixins-ui/src/chart.ts:207` (`en-US`, "so a server and the browser write the same digits"); `examples/cms/src/content/site.ts:59` (`'en'`, `UTC`) | correct, and not localizable |
| The Model's locale read from the runtime in `init` | `primitives/src/state/locale.ts:24` (`navigator.language`) | against i18n-DESIGN's one rule; used by no package or example; step 1 decides whether it stays |

Not counted: `examples/foldkit/*` (ports of upstream's examples, kept as
upstream writes them), terminal logs (`examples/reference/src/dev.ts:11`),
`toLocaleLowerCase` for matching, `Intl.Segmenter` in `foldkit-richtext`, and
`toFixed` on CSS values. Byte sizes are written twice and disagree
(`form-recipes/src/file.ts:141` in decimal `kB`, `richtext/src/media.ts:55` in
binary `KB`); that is a duplicate to settle, not a locale question.

### The gap that matters

A list draws a value through its `Display`, whose `text(value, words)`
(`crud/src/display.ts:28`) receives `DisplayWords` at render: `yes`, `no`,
`nothing`, `separator` (`:47-56`). The locale is not among them. It is the
`data` a recipe was declared with (`FieldRecipes.date({ locale })`,
`Cms.Display.Moment.of({})` at `cms/src/index.ts:129`), at module scope. So a
CMS list in French still writes "Sep 27, 2026", and nothing an application
passes at render can change it. A `Format.of(locale)` that views call would
not reach these: the fix is a path from the Model to the Display.

## 2. Verdict: not yet

An API lands when it deletes or speeds an application's own code.

- **Application code:** 3 date sites, 8 counts and 3 prices, in five examples.
  Each is one line and stays one line. None gets shorter.
- **Package code:** 4 caches and 2 ladders become one of each, about 60 lines.
- **What it fixes:** the 14 frozen locales, which is the real work, and which
  cannot be tested until a Model holds a second locale. i18n step 1 is not
  built: `grep locale examples/*/src` finds no Model field.

Built today, every call would be `of({ locale: 'en', timeZone: 'UTC' })`, which
a module constant does already (`examples/cms/src/content/site.ts:59`). So:
F0 now, since a published view that draws differently on a server is a defect
whatever the locale; F1 onward when step 1 lands in the CMS example.

## 3. Ownership

| Fact | Owner | Not the owner |
| --- | --- | --- |
| Which locale and time zone this page is written in | the Model, from the route (step 1) | the formatter, the runtime's default |
| The device's own time zone | the device; it enters as a Flag or a Message | a view |
| What the clock reads, for "3 days ago" | the Model (`now`), moved by a Subscription | the formatter, which never reads a clock |
| How a value is written for given conventions | `LocaleFormat`, in `foldkit-entity/locale` | `foldkit-cms`, `foldkit-form-recipes` |
| Which value a Display writes, and in what style | the Display (`foldkit-crud`, the recipes) | `LocaleFormat` |
| Parsing typed text into a date or an amount | the Control (`form-recipes/src/wall.ts`, `number.ts`) | `LocaleFormat`: it writes, it does not read |
| The words around a value, and which plural form | word tables and `fillWords` (step 2) | `LocaleFormat`, which only names the plural category |

`LocaleFormat` owns no state and no transition. It is a pure function of its
arguments plus the runtime's ICU data (section 6).

## 4. Decisions

Decided by delegation, 2026-11-11.

**1. The name is `LocaleFormat`, not `Format`.** `foldkit-media` exports
`Format`, the image formats (`media/src/format.ts:4`), and `foldkit-plus/media`
re-exports all of it (`plus/src/media.ts`). `packages/plus/src/index.ts` leaves
"a name two packages export" to its subpath, so a second `Format` would
compile, and an import of the wrong one would read as a type error far from
the mistake. `Locale` is taken twice (`primitives/src/state/locale.ts`,
`form-recipes/src/index.ts:30`).

**2. It lives in `foldkit-entity`, as the subpath `foldkit-entity/locale`.**
i18n-DESIGN's premise is that the pieces land in packages that own them, not
in a package of their own. The callers are `foldkit-cms`,
`foldkit-form-recipes`, `foldkit-crud` and, for plurals in step 2,
`foldkit-form`; `foldkit-entity` is the one package under all four, depends
only on `foldkit-metadata`, runs on a server, and already owns the two
neighbouring facts: `Words.of` (a field's text for people) and `Collation`
(locale-sensitive text that a server and a client must agree on). A subpath of
its own, one entry per file, so a page that formats nothing pays nothing
(`scripts/test/publishedBuild.test.ts` holds that). Rejected: section 8.

**3. What travels is data; the formatter is made at the leaf.** A view input
may hold no nested function (`h.submodel` throws), so a record of formatters
cannot be passed down as words are. `Conventions` is two strings, sits in a
Model, crosses the SSR envelope, and passes anywhere; `LocaleFormat.of` turns
it into functions where the text is written.

**4. `timeZone` is required and has no default.** A missing zone is the bug
S6 found (ssr-PLAN). A page generated for everyone says `'UTC'` or the
content's own zone in so many words. Per-call options omit `timeZone`: one way
to say it.

**5. An instant and a calendar day are different functions.** `instant(ms)`
is written in the conventions' zone. `day({ year, month, day })` has no zone
and is always written as UTC, as `form-recipes/src/index.ts:62` does: written
in a zone west of UTC it would name the day before.

**6. The locale reaches a Display through `DisplayWords.conventions`.** The
words already flow to every Display at render (`ViewWords` in
`mixins-crud/src/index.ts:20`, `data-grid/src/crud.ts:32`), are plain data,
and are chosen by the same locale. A recipe's declared `locale` stays as an
override (a price always written as `de-DE` writes it); with neither, a
Display writes `en` and `UTC` as today, which is fixed, not the runtime's.

**7. `of` is memoized, and the memo is bounded.** One formatter set per
`(locale, timeZone)`, each `Intl` object made on first use per options (by the
options object's identity first, then by its JSON, so a module constant costs
no stringify per cell). The four caches today are unbounded, which is safe
only because their keys are written in source. Once the locale comes from an
address, an unbounded map on a long-lived server grows by request: the memo
keeps a fixed number of sets (64, a guess to measure) and drops the oldest.

**8. Server and client agree by construction, to the limit of ICU.** Both
render from the same Model, so both pass the same `Conventions`, `now` and
values. The device's zone is not in the first frame of a served page: the
resumed Model's zone draws it, and the device's arrives as a Message after
(an ordinary redraw, not a mismatch). A page with no server reads it in
Flags. What is not guaranteed is section 6's last row.

**9. Relative time takes `now` as an argument.** One ladder, truncating
("1 hour ago" until two full hours). `primitives`' `formatRelativeTime` is
removed in F3 rather than kept as a second way; nothing imports it but its
own test and README.

**10. Composition with step 2.** A formatted value fills a blank as text:
`fillWords(words.published, { date: format.day(at) })`. `fillWords` stays
free of `Intl`; its plural-aware form (step 2) asks `format.plural(count)` for
the category and `format.number(count)` for the digits, so `foldkit-form`
holds no `Intl.PluralRules` cache of its own. The word table and the
conventions are chosen by one Model field, `conventions.locale`.

## 5. Sketch

Pseudocode: none of this exists.

```ts
// foldkit-entity/locale (sketch)
export const Conventions = Schema.Struct({ locale: LocaleTag, timeZone: TimeZone })
//   LocaleTag: well-formed per Intl.getCanonicalLocales; TimeZone: one Intl accepts.
//   Both checked at decode, so a malformed one never enters a Model.

type DateStyle = Omit<Intl.DateTimeFormatOptions, 'timeZone'>

export interface LocaleFormat {
  readonly instant: (epochMillis: number, style?: DateStyle) => Option.Option<string>
  readonly day: (date: CalendarDate, style?: DateStyle) => string
  readonly number: (value: number | bigint, options?: Intl.NumberFormatOptions) => string
  readonly money: (decimal: string, currency: string) => string
  readonly relative: (epochMillis: number, now: number) => Option.Option<string>
  readonly list: (items: ReadonlyArray<string>, kind: 'and' | 'or') => string
  readonly plural: (count: number) => Intl.LDMLPluralRule
}

export const LocaleFormat: {
  readonly of: (conventions: Conventions) => LocaleFormat
  /** Throws, naming it, for a locale this runtime has no data for. */
  readonly supported: (locales: ReadonlyArray<string>) => void
}
```

```text
route.locale ─► Model.conventions ─┬─► LocaleFormat.of ─► text in a view
                 (locale, zone)    ├─► ViewWords.conventions ─► Display.text
                                   └─► words[locale] ─► fillWords
```

## 6. Failure semantics

| Failure | What happens | Why |
| --- | --- | --- |
| A malformed locale or zone | refused where `Conventions` is decoded (the route, Flags); `of` never sees one | `Intl` throws `RangeError` on both, and a throw in a view is a crashed page |
| A well-formed locale the runtime has no data for | `of` asks for `[locale, …its parents, 'en']`, so it writes English | `Intl` given one unknown tag falls back to the **runtime's default**, silently: the nondeterminism this note exists to remove |
| The same, for a locale the application declares | `LocaleFormat.supported(locales)` throws at start and in a test | a quiet English page is a defect to find at definition time |
| An instant that is not finite or is out of `Date`'s range | `Option.none()`; a Display writes `words.nothing` | `Intl.DateTimeFormat.format(NaN)` throws |
| A currency that is not three capital letters | throws where the recipe is declared, as `form-recipes/src/index.ts:598` does | `Intl.supportedValuesOf` differs between ICU releases |
| `NaN`, `Infinity` as a number | written as `Intl` writes them | they are values, and `Intl` does not throw |
| Two ICU releases write different text for equal arguments | not prevented. Tests take every spelling; a served page's text may differ from the browser's by a space or a mark | ICU 78 groups Swiss francs with `'` where 77 wrote `’` (AGENTS.md, "`pnpm exec` and `npx` can run different Nodes"); the space before "PM" changed in ICU 72 |

The last row narrows the guarantee: **equal text for equal arguments on one
ICU.** Whether hydration adopts an element whose text differs, or rebuilds it,
is not known here and is F4's first probe.

## 7. Phases

| Phase | Ships | Measure | Tests |
| --- | --- | --- | --- |
| F0, built (0103c0b) | `Cms.historyCard` takes its locale and zone from its options instead of the runtime (`cms/src/views.ts:82`); the two example views say theirs. No new package API beyond that option | the three sites of section 1 read no default | S6's check for the card: rendered in two child processes (`TZ`, `LANG` differing), the HTML is equal. Mutation: restore `undefined`; drop `timeZone`. Built as `cms/test/history.test.ts`; both options are required (no studio-wide configuration exists to give them once, and a default would be the hidden one this phase removes) |
| gate | i18n step 1: a Model in the CMS example holds a locale | | |
| F1 | `foldkit-entity/locale`: `Conventions`, `of`, `supported`, all but `relative`. `cms/src/kinds.ts` and `form-recipes` use it; their four caches go | lines deleted (about 60); formatting a drawn cell no slower than today's caches (`pnpm bench`); an entry that imports none of it is the same size | Types, one defect per negative: no `timeZone`; `timeZone` in a style; text given to `instant`; a number given to `day`. Mutations: drop the zone; write `day` in the zone (a zone west of UTC); drop `'en'` from the list (a child process whose default is `de`, an unknown tag); key the memo without the zone; remove the bound |
| F2 | `DisplayWords.conventions`; the Moment and recipe Displays read it; the CMS example's lists in its second locale | the 14 frozen reads follow the Model | a list in the second locale shows no month of the first; the conventions pass through `h.submodel`; a declared `locale` still wins |
| F3 | `relative` with `now` from the Model; one ladder; `formatRelativeTime` removed | one ladder, not two | each unit's boundary, past and future; mutation: round for truncate |
| F4 | a generated page per locale through it | ssr-PLAN S6's check passes over every generated page | the probe: a served text node that differs from the client's, and whether its element is kept (`adoption`, as `examples/reference/e2e`); a round trip, rendered to a string and hydrated |

Each of F1 to F3 changes a published API: a Jev review with the README and
the skill reference included, a changelog entry, and `pnpm --filter
foldkit-plus generate` then `pnpm paths` for the new subpath.

## 8. Review points and rejected alternatives

Review points:

- **Is `foldkit-entity` right?** A view that formats a date imports from the
  package of domain declarations. The case for it is decision 2; if a second
  consumer outside the data stack appears (`foldkit-mixins-ui`'s Chart), a
  leaf package is the alternative. Decide before F1 ships a name.
- **The Chart writes `en-US`** (`mixins-ui/src/chart.ts:207`) and
  `foldkit-mixins-ui` does not depend on `foldkit-entity`. Whether it takes
  conventions, or its caller's already-written labels, is its own decision.
- **Controls parse in a declared locale too** (`form-recipes/src/number.ts:58`
  reads a locale's separators). F2 moves Displays only; a form whose inputs
  follow the Model's locale needs the conventions in the Control's path.
- **F4's probe decides the ICU row.** If a differing text node rebuilds its
  element, the options are to accept it or to carry the server's text in the
  envelope; both are worse than a patched text node, so probe first.
- **Is `'en'` in every runtime?** Node and browsers, yes; check workerd in F1
  with `Intl.DateTimeFormat.supportedLocalesOf` inside a `Stack`.

Rejected:

- **A package of its own.** About 150 lines, and i18n-DESIGN decided against
  an i18n package.
- **`foldkit-primitives`**, beside `formatRelativeTime`. `foldkit-form`,
  `foldkit-crud` and `foldkit-cms` do not depend on it, and a headless form
  should not reach a package of browser behaviours for plurals.
- **`foldkit-crud`**, beside `Display`. `foldkit-form` is below it and needs
  the plural category.
- **A service or a Slot carrying the locale.** A view is a function of its
  Model; a locale that arrived any other way would not be in the envelope,
  and the server's draw and the browser's would have two sources.
- **`of(locale)` with the zone as a per-call option.** That is today's shape,
  and the zone is what gets forgotten (`examples/chirp/src/view.ts:53`).
