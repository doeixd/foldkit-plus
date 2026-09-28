# Internationalization: one locale, owned by the route

> **Status:** proposed, 2026-09-27. Nothing here is built. It gathers what the
> other designs say about locales, checks it against the code, and decides
> who owns what, so the pieces land in the packages that own them rather than
> in a package of their own.

A localized application shows each reader their language, their formats and
their text direction, and localized content: a post in French is its own
text, not a translation drawn from English at runtime. Foldkit Plus has most
of the parts already, spread across packages, each written to be translatable
and none translated:

- **Words are data.** `fillWords` in `foldkit-form` fills blanks in text
  (`'{label} is required'`), and its doc comment says why: "words as text, not
  functions, can be kept in one place, translated, and passed anywhere". The
  word tables are typed: `FormMessages` (`foldkit-form`), `FormViewWords`
  (`foldkit-mixins-form`), `ViewWords` (`foldkit-mixins-crud`), `EditWords`
  (`foldkit-builder`).
- **Labels come from Schemas.** `Words.of(schema)` in `foldkit-entity` reads a
  field's `title` and `description` annotations, which forms, lists and the
  Builder's inspector draw. They are written once, in one language.
- **Direction is logical.** Styles use `marginInlineStart`, `paddingInline` and
  the like; the few physical `left`/`right` properties are mostly in the CMS
  example's site styles. Foldkit's `Document` carries `lang` and `dir`.
- **Locales are named in three designs:** cms-DESIGN §14 (one draft and one
  revision log per locale), router-DESIGN §33.11 (the locale in the route),
  ssr-PLAN Phase S9 (localized generated pages) and server-DESIGN §19.9
  (negotiation at the edge).

## Who owns what

| Fact | Owner | Where it lives |
| --- | --- | --- |
| Which locale this page is in | the route | the Model, from the address |
| A reader's preferred locale, before an address names one | the reader's device | a `Mirror.kv`, or the server's negotiation |
| The application's own words, per locale | code | word tables, chosen by the Model's locale |
| A field's label and help, per locale | the domain declaration | Schema annotations, per locale |
| Localized content (a post in French) | the CMS | an entry's per-locale draft and revisions |
| How a date or number is written | the locale, explicitly | `Intl`, with the Model's locale and a time zone |

One rule runs through it: **the locale is in the Model, and nothing reads the
runtime's default.** A view that formats with `toLocaleDateString(undefined)`
or reads `navigator.language` renders differently on the build server and in
a reader's browser, which SSR Phase S6's determinism check exists to catch.
The CMS example already met the time-zone half of this.

## The mental model

```text
address ──► route.locale ──► Model
                               │
            ┌──────────────────┼───────────────────┐
            ▼                  ▼                   ▼
      words(locale)     Intl formats(locale)   Remote reads
      tables, as data   with a time zone       with locale input
            │                  │                   │
            └──────────────────┼───────────────────┘
                               ▼
                         view (lang, dir)
```

Changing locale is a navigation to another address, not a Message that
rewrites text in place, so every locale has its own address, its own
generated page and its own cache entry.

## Words

Word tables stay data: text with blanks, no functions, since Foldkit refuses a
function nested in a view's inputs. What is missing is the choice between
tables and plurals.

- **One table per locale per package,** exported where the defaults are
  (`editWords` becomes `editWords.en`, beside any others a package ships), and
  an application's own tables beside them. A view receives the table for the
  Model's locale, as it receives its words today.
- **Plurals as data.** A word that counts is `{ one: '{count} post', other:
  '{count} posts' }`, and `fillWords` picks the form with `Intl.PluralRules`
  for the locale it is given. Still text, still passable.
- **A missing word falls back** along the locale's chain (`fr-CA`, `fr`, the
  default), and a test lists every key a table lacks against the default's.

## Labels from Schemas

`Words.of(schema)` returns one `title` and one `description`. A localized form
needs them per locale without annotating every Schema once per language.

- **Keyed annotations.** A field's `title` stays the default language; an
  optional `words` table keyed by Entity and field
  (`{ 'Post.title': { fr: 'Titre' } }`) is consulted first by
  `Words.of(schema, { locale, table })`. The Schema stays the one declaration;
  the table is data a translator edits.
- A check's own message (`isMinLength(1, { message })`) is localized the same
  way, through `FormMessages.invalid`, which already rewrites Schema messages.

## Formats

Dates, numbers, currencies and relative times are written with `Intl`, given
the Model's locale and an explicit time zone: the reader's, when the page is
theirs alone; UTC or the content's own, when the page is generated for
everyone. A small `Format` value built from the locale
(`Format.of(locale).date(iso)`) keeps views from passing the pair everywhere.
Relative times ("3 days ago") read the clock, so a generated page shows an
absolute date and the browser may refine it after it takes the page over.

## Content

A localized entry is cms-DESIGN §14's: the locale is part of an entry's
identity, with a draft and a revision log per locale. Decided here:

- **A page is one Document per locale,** not one Document with translated
  props. Layout differs between languages (a longer German heading, a
  right-to-left column order), and a per-locale Document lets it. The entries
  are linked as translations of each other.
- **Slugs are per locale,** so the address reads in the reader's language.
- **Remote reads take the locale as input** (`Cms.bySlug(Posts)` with
  `{ locale, slug }`), so a list never mixes languages and a missing
  translation is a missing row, which the site says rather than showing
  another language unasked.
- **Fallback is the site's choice,** made once: show the default language
  with a notice, or leave the page out of that locale.

## Routing, SSR and the server

These are specified where they are owned:

- The locale is a route parameter at the top of the Site graph; targets carry
  it and give each page's alternates. router-DESIGN §33.11.
- Each locale is its own generated page with `lang`, `dir`, `hreflang`
  alternates and sitemap entries. ssr-PLAN Phase S9.
- A reader arriving at an address with no locale is negotiated once, from
  `Accept-Language` or a stored choice, and redirected. server-DESIGN §19.9.

## Right to left

`dir` comes from the locale in the Model and is set on the `Document`, so
the server's render and the browser's agree. Styles already use logical
properties; an audit turns the remaining physical ones into logical ones, and
a check (a lint over `Style` declarations for `left`/`right`/`marginLeft`…)
keeps them out. Icons that point (a back arrow) are mirrored by a Slot's
`dir`-aware style, not by a second icon.

## Agents

An agent sends the same Messages whatever the reader's locale, so the Message
union needs no translation. What an agent reads (a Surface's description, a
tool's words) can take the locale like any view, but defaults to one working
language: a tool's schema is a contract, not a screen.

## Sequence

1. Locale in the Model and the route, with `lang` and `dir` set from it, in
   the CMS example with a second language.
2. Word tables per locale and plural forms in `fillWords`; the package
   defaults become `en` tables.
3. `Format.of(locale)`, and the example's dates through it.
4. Per-locale CMS entries (cms-DESIGN §14) and locale-aware reads.
5. Keyed Schema words for labels.
6. Generated pages per locale, alternates and negotiation (SSR S9, server
   §19.9), once there is localized content to generate.

Each step ends in a test that can fail: a page in the second locale shows no
word of the first; a missing key is listed; a date renders the same under two
default locales; a list in one locale never returns another's rows.
