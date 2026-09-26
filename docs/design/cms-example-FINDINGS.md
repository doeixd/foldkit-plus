# Findings from building out the CMS example

Building `examples/cms` into a fuller blog CMS and page builder (the studio at
`/` and `/pages`, the public site at `/site`) is a way to use the packages the
way an application would. This file records what that turned up, as it turns
up: bugs, API friction, and suggestions. Each item says where it was met, what
went wrong, and what was done or is proposed.

Status: **fixed** (with the commit), **proposed** (not yet done), or
**worked around** (the example does something a user should not have to).

## API friction and bugs

1. **A recipe with only a base must still write `variants: {}`.**
   `foldkit-mixins` `Style.recipeFor(Slots)({ base })` is a type error:
   `SlotRecipeDef.variants` is required. A Block look with no choices (Quote,
   Divider, FeaturedPost) had to write `variants: {}`.
   **Fixed** (plan area 2f): `variants` is optional in `Style.recipe` and
   `Style.recipeFor`, and the example's `variants: {}` are gone.

2. **A Selection's value has no name.** `Entity.select(Post, {...})` has no
   `.Type`; the value type is `typeof PostCard.schema.Type`, which a reader has
   to find in the source. *Proposed:* an `Entity.Selected<typeof S>` type (or
   `.Type` on the Selection, like a Schema). **Fixed** (plan area 5d):
   `Selected<typeof S>` from `foldkit-entity`, a type alias rather than a
   phantom property every Selection value would carry.

3. **`query<Principal>(descriptor, …)` in `foldkit-remote-drizzle` loses the
   input type.** Naming the principal type argument makes TypeScript default
   the second one (`Input`) to `unknown`, and the descriptor no longer fits:
   "not assignable to `QueryDescriptor<string, unknown, unknown>`". The caller
   has to spell `query<Principal, typeof RecentPosts.Input.Type>(…)`, as
   `cms-drizzle` does internally. *Proposed:* take the principal from the
   binding or put `Input` first so it is inferred, or a curried
   `query.for<P>()(descriptor, …)`. **Fixed** (plan area 4b) without an API
   change: `query` needs no type arguments. A source that reads no principal fits
   any server, and one that does types it on its `where` parameter, which
   infers it. The example and cms-drizzle dropped theirs (and a cast), and
   `query.test-d.ts` pins it, including the refusal.

4. **`Renderer.render`'s options refuse `undefined`.** Under
   `exactOptionalPropertyTypes`, `{ data: reads?.read(model) }` is an error, so
   every caller writes `data === undefined ? {} : { data }` (the page demo and
   the site view both do). **Fixed** (plan area 1): the fields take
   `| undefined`, and the reads give `data(model)`, `{}` while there is nothing
   to read, so neither caller builds the options by hand.

5. **A `Renderer<…, never>` cannot draw into an application's builder.**
   `HtmlBuilder` is invariant in its Message, so the site view cannot pass its
   own `h`; it draws with `inertHtml`, as the Builder's canvas does. That works
   (the result is plain `Html`), but nothing says so. *Proposed:* document it in
   the composition README's "Drawing a page", or let `render` accept any builder
   when the Renderer sends nothing. **Fixed** (plan area 4b): a message-free
   Renderer takes any application's builder, so the site view draws with its own
   `h`; one with Messages still refuses another application's (a type test pins
   both).

6. **The inspector draws a number-literal prop as text it cannot edit.**
   `Schema.Literals([3, 5])` resolves to no control (only string literals make a
   `Select`), so `LatestPages.count` shows `3` as code. The new Blocks use string
   literals (`'3' | '6' | '9'`) to get a select. *Proposed:* the inspector (or
   `Input.resolve`) offers a select for number literals and stores the number.
   **Fixed** (plan area 5c): `Select`'s options are text or numbers, its draft is
   the option as text, and the value (in a form, and as a Builder prop) is the
   option itself. The example's PostList `count` is `3 | 6 | 9` again.

7. **An unsaved new entry had no public name.** Writing the open entry into the
   address put a page's id there before its first save, so a reload asked for
   an entry the server did not have. **Fixed** in `dcaf658`:
   `placed.storedEntry(model)`.

8. **Routing callbacks lose inference inside `placements.complete`.**
   `makeApplication`'s `routing.onUrlChange: url => …` and `init: url => …`
   need `(url: Url)` written out, or `complete`'s checks report a misleading
   "update does not accept every placement's Messages". Status: worked around;
   *proposed:* check whether `complete` can infer the config before it checks.
   **Explained** (plan area 4b): TypeScript does not infer from an object literal
   that holds an unannotated callback before typing that callback, and
   `makeApplication` is overloaded, so nothing types it through `complete`; the
   config falls back to `complete`'s constraint and every check fails. A type
   cannot see this, so the `update` error now names the cause and the bundle
   README says to annotate. The annotations in the example stay.

9. **Seeding content means writing the CMS's tables by hand.** There is no
   server-side way to create a published entry (row, entry, revision) without a
   client session, so `seed.ts` inserts into `cms_entries` and `cms_revisions`
   itself and must match what a publish writes. *Proposed:* a `CmsServer`
   import or seed operation. Status: worked around.

10. **An active read written by hand repeats `owner: Data.contract.owner ?? {}`.**
    The `?? {}` is a quiet fallback (AGENTS.md De-slop), and the object shape
    (`name`, `owner`, `messages: []`, `projectionOf`) is repeated for every
    read. The site app uses `App.owner` in a small `reading` helper instead.
    **Fixed** (plan area 1): `Data.active(name, projectionOf)` in Remote,
    which takes the owner from the domain's application and throws for a
    domain on a raw optic. Every hand-written active in the example uses it.

11. **A preview that lacks a selected field reads as `Initial`, silently.**
    The post preview overlays the form's value on Remote's store. When the
    page's selection gained `publishedAt`, which a form value does not hold,
    the preview of a new post read `Initial` forever, with nothing saying a
    field was missing. The posts demo caught it; a browser would just show an
    empty pane. The example now previews through `PostPreview`, which selects
    only what the form holds. **Fixed** (plan area 1e): a read of an entity
    only overlays show reads `Failed`, with an `Overlaid` error naming the
    fields the overlay lacks.

12. **Casts left in the example point at API gaps.** None is new, but each is
    a place a user would cast too:
    - `Worklist.active.projectionOf(model)!` (`app.ts`): a Crud list's active
      always has a projection, but its type says it may not. **Fixed** (plan
      area 1): `Worklist.refresh(model)` asks for the list again,
      so the example no longer reads the projection itself.
    - `effect.pipe(…) as never` and `{ … } as never` (`demo.ts`), around
      `RemoteServer.handlers` results and a hand-made client service.
      **Fixed** (plan area 5d): the demo builds its client with
      `Remote.clientLayer(handlers)`; the cast on its Commands hid a real gap,
      the CMS editor typing its Commands' requirements as `any`, which now
      carries the form's.
    - `(yield* DrizzleDatabase) as unknown as Writes` (`server.ts`): the
      database service is not typed for a plain `insert`/`update` in a handler.
      **Fixed** (plan area 3c): `drizzleWrites` is typed by each table, and
      `server.ts` and cms-drizzle no longer cast; `post-${n} as PostId` became
      `PostId.make`.
    - `id as never` / `entry as never` for branded ids (`app.ts`): **fixed**
      here with `PostId.make` and `EntryId.make`.

13. **Absence is `null` or `undefined` across the packages' APIs.** The rule
    is now in AGENTS.md (De-slop, `8c0ea72`): a value that may be absent is an
    Effect `Option`, with `null` kept only at a boundary that speaks it. The
    packages predate it. A rough count of `| null`, `| undefined` and `NullOr`
    in `src`: remote 115, cms 69, composition 45, form 40, builder 27,
    mixins-builder 20, mixins-form 13. Some are boundaries (stored JSON, the
    wire, database columns) and stay; the application-facing reads are not.
    The ones this example meets:
    - `foldkit-builder`'s Model: `selected`, `hovered`, `refused`, `drag`
      (`Schema.NullOr`), and `Message.Selected({ id: NodeId | null })`.
    - `foldkit-cms`'s placed editor: `entry` and `pageId` (`string | null`),
      `state` and `error` (`| undefined`), `resumed` (`| null`).
      `storedEntry` is an `Option` (changed here, since it was unreleased).
    - An active read's `projectionOf` and `QueryBlock.active`'s `documentOf`
      must return `| undefined` for "nothing to read now", so the example's
      `pageRead`, `postRead` and `pageDocument` do too.
    - `foldkit-remote` reads: `RemoteData` is already a tagged union, but a
      Selection's nullable fields come through as `| null`, which the example
      converts with `Option.fromNullOr` where it reads them (`publishedAt`).
    - A relation picker for an optional prop stores `null`, which is right for
      the stored JSON; the prop's Schema should be `Schema.OptionFromNullOr`,
      so the view gets an `Option` (the example's `FeaturedPost.post` and
      `LatestPages.except` now are).
    *Proposed:* migrate the application-facing reads package by package,
    starting with the Builder's Model and the placed editor, since both are
    0.x. **Fixed** (plan area 1) for the reads the example meets: the
    Builder's Model, Messages and helpers, the placed editor's reads, Surface
    and Remote actives, Crud's `id`/`input`/`more`, and composition's reads.
    Stored JSON keeps `null` through `Schema.OptionFromNullOr`. Internal
    Models and the wire (Primitives' DOM facts, the CMS's `schedule`,
    composition's `setWhen`) still use `null`, as a boundary that speaks it.

14. **The inspector asked the decoded side whether a prop may be empty.**
    Found by item 13: with `FeaturedPost.post` typed
    `Schema.OptionFromNullOr`, the relation picker lost its blank, because
    `Schema.is(schema)(null)` checks the decoded type (`Option`), while the
    Builder stores the encoded side (`null`). **Fixed:** the check is
    `Schema.is(Schema.toEncoded(schema))(null)`, and the mixins-builder fixture's
    `category` is `OptionFromNullOr`, so the test covers it (reverting the fix
    fails it). Plan area 1 moved the question into composition:
    `Block.stored(block, key)` is a prop's stored Schema, and `StoredPropsOf<B>`
    names the stored side beside `PropsOf<B>`.

15. **`accent.text` reads as "accent-colored text" and is the opposite.**
    `Theme.oklch`'s `<family>.text` (`accent.text`, `error.text`, `info.text`,
    …) is the text color *on* the family's full fill, computed for contrast
    (white on a mid accent). The example used it for colored text on a light
    surface, and the site's "Featured" label, its "Read the post" link and the
    current nav item came out nearly white; the error colors and state badges
    had the same mistake. mixins-ui's own recipes use it correctly, as
    `onFill`. *Proposed:* rename it `onFill` (or `on`), matching the recipes, and
    say in the theme docs which token is for colored text (`default`, or a
    `text` that means it). **Fixed** (plan area 2c): the token is `on-fill`,
    each family gains `ink` (its color as text on the base surface), the
    duplicate `text.on-accent` goes, and the examples' colored text is `ink`.
    Prose's `mark` had the same mistake (`accent-text` on the accent's subtle
    tint) and now uses `ink`.

16. **The button recipe left a link underlined.** `Recipes.Button` on an `<a>`
    (mixins-ui's `Anchor`, or a Block's link button) kept the element
    defaults' underline and link color on its label. **Fixed** in the recipe:
    `textDecoration: 'none'`.

17. **The element defaults color every heading.** `Defaults.headings` sets
    `color: text-overt` on `h1`–`h6`, so a heading inside a colored band (the
    Hero's accent tone) stays dark unless its own style says `inherit`. That is
    a reasonable default, but a Block author meets it as "my title is the wrong
    color". *Proposed:* headings inherit, with `text-overt` on `body` content
    only, or a note in the defaults' docs. **Fixed** (plan area 2d): headings
    are `var(--fk-heading, text-overt)`, a band sets `--fk-heading:
    currentColor`, and the Hero's title no longer says `color: inherit`.

18. **The CMS's address control has no Slots of its own.**
    `Cms.controlRenderers()` draws the slug as a bare `span` holding a prefix
    `span` and the `text` slot's input. With the input full width, the prefix
    sat on its own line above it, and the only handle to fix that was the
    `data-cms-slug-prefix` attribute. *Proposed:* publish the group and the
    prefix as Slots (or draw them in `FieldSlots.control`), so an application
    styles them like any other part. **Fixed** (plan area 2b): `FieldSlots`
    has `group` and `affix`, the slug is drawn in them, and the example styles
    them as Slots.

19. **After a publish, the author's own screen kept the old content.**
    Publishing a changed title in the studio said "Published", but the
    preview pane (the application's own read of the row) still showed the old
    title. cms-drizzle ran the application's publish handler, then patched only
    the row's `published` column back to the client; the handler returned no
    patch of its own (`{ output: {} }`), so the client's store never learned the
    new title. The README asked handlers to return their patches, but every
    application meets this. **Fixed:** the publish patches every column of the
    row as the handler left it (the CMS already read the row back), so a
    handler need not; `drafts.test.ts` asserts it and fails without the fix.

20. **A title given before a check was lost, and a check's title named the
    key.** The page form's Builder field was labelled "fits the Catalog". Under
    Effect 4, a schema with checks resolves to the *last check's* annotations:
    `Schema.String.annotate({ title: 'Name' }).check(Schema.isMinLength(1))`
    resolves with no title, so the form labelled the key by its name, and
    `Document.check(Composition.valid(Site))` resolved to the check's own
    `title`, which the form took for the field's label. **Fixed** twice:
    `foldkit-form` falls back to the schema's own annotations when the resolved
    ones have no title or description (a test fails without it), and
    `Composition.valid` describes itself with `expected`, as Effect's checks
    do, instead of claiming a `title`.

21. **The layers tree gives no handle for indentation.** A row says its depth
    only as `aria-level`, so indenting the tree means one rule per level. The
    example writes rules for levels 2 to 6. *Proposed:* `TreeNavigation` writes
    the level as a custom property too (`--fk-tree-level`), so one
    `calc(var(--fk-tree-level) * 1rem)` indents any depth. **Fixed** (plan
    area 2b): it does, and the example's per-level rules are one `calc`.

22. **A Query Block showed more rows than its `first`.** In the page editor,
    the PostList (3 posts) showed all four on the canvas, while the public site
    showed three. Remote keys a connection by query and input, not window, so
    the picker's read of the same list (`first: 50`) filled the connection, and
    the Block's `first: 3` read got every row it held. **Fixed** in
    `QueryBlock.reads`: each node's read is cut to its own `first`, with
    `hasNext` set when rows were cut. Then **fixed in Remote** (plan area 3a):
    every query read shows at most its window, and `QueryBlock.reads`' own
    cut is gone. The reverse also held and is fixed: a wider window asked for
    after a narrower one had loaded the connection was never fetched. `remote.test.ts` reads a wider window of
    the same query first and asserts the Block still gets its two; it fails
    without the fix.

23. **The canvas's hover mark hid the selection mark.** A node under the
    pointer is hovered and selected at once, and the example's hover rule came
    later, so the selection drew as the hover's dashed line, and in the accent
    color on an accent Hero, invisibly. Fixed in the example (selection drawn
    last, in a warm color). **Fixed** (plan area 2e): one attribute,
    `data-composition-mark`, is `selected` or `hovered`, and a node that is
    both is `selected`, so no stylesheet can order the rules wrong.

24. **An inserted Block is selected but not shown.** Adding a Quote to the
    last Section of the home page selected it (the address named it), but
    neither the layers panel (a scrolling list) nor the canvas scrolled to it,
    so the new Block was out of view in both. *Proposed:* the Builder's
    layers and canvas Behaviors bring the selected row and node into view when
    the selection changes (`scrollIntoView({ block: 'nearest' })`). **Fixed**
    (plan area 5c): `KeepInView({ selector })` in `foldkit-primitives/dom` scrolls
    what newly matches into view, and the Builder mounts it on the layers and the
    canvas; its jsdom test asserts an inserted Block's row and element are
    scrolled to.

25. **Publish is offered to someone who may not publish.** A writer sees the
    same Publish button as an editor and learns on clicking that "This author
    may not publish this entry". The refusal is right, and said well, but the
    client could know before: `allow` is the server's, and `Cms.offers` says
    what an entry offers, not what this principal may do. *Proposed:* the
    editor exposes what the signed-in principal may do (the server says so with
    the entry), so an application can hide or disable what would be refused.
    **Fixed** (plan area 5b): the Entry has a server-derived `may`, the
    transitions `allow` lets the reader ask; the editor gives
    `placed.may(model, transition)`; `FormView` takes `submits: false`. The
    example leaves out Publish, Schedule and Unpublish for a writer. (Not checked
    in the browser: the window was hidden, so the tab did not render.)

26. **The inspector loses a Block prop's title given before a check.** Found
    while writing the plan: mixins-builder's `labelFor` reads
    `Schema.resolveAnnotations(schema)?.title`, which under Effect 4 is the
    last check's annotations (F20), so a prop written
    `Schema.String.annotate({ title }).check(…)` is labelled by its key.
    **Fixed** (plan area 4a): `Words.of(schema)` in `foldkit-entity` reads a
    title and description the way the form did, and the form, Crud's columns
    and the inspector all use it; the inspector's test fixture and Crud's now
    put a title before a check.

27. **An outline button on a colored band draws its text in the family's ink.**
    Found checking area 2c: the Hero's second action, an outline Button, has
    dark accent text on the accent band ("About this site"), as it had with
    `text.link` before. A tone's `ink` is right on the base surface and wrong
    on a band, the same situation as headings (F17). *Proposed:* the recipes'
    unfilled variants read `var(--fk-ink, <tone ink>)`, so a band that sets
    `--fk-ink: currentColor` (beside `--fk-heading`) recolors them too.
    **Fixed** (plan area 2c): they do, and the Hero's tones set both.

28. **The example's HTTP endpoint trusted its input.** Found removing its
    cast (plan area 5d): `http.ts` passed the request's JSON to the handlers
    unchecked (`payload: never`), and looked the chair up with
    `principals[header]`, a plain object indexed by a client-chosen name, so
    `x-chair: constructor` read `Object`'s own member as a principal. **Fixed:**
    the envelope and each payload are decoded with the protocol's schemas
    (`ReadBatch`, `QueryRequest`, `MutationRequest`) before a handler sees them,
    and the chair is looked up with `Object.hasOwn`. Checked against the running
    server: a `constructor` chair reads as a visitor, and a payload without
    `version` or an unknown operation is refused with the schema's error.

What to change, area by area, is in [cms-example-PLAN.md](./cms-example-PLAN.md).

## Checked in the browser

Everything below was driven in Chrome against `pnpm dev`:

- The public site: home, blog, a post, About, a page made in the studio, a
  missing address, and dark mode (`light-dark()` throughout).
- The studio's posts: open a seeded post, edit, autosave, publish, the
  worklist and preview following.
- The page Builder: open by link, select on the canvas and in the layers,
  change a look (Hero tone), insert a Block, pick a FeaturedPost, publish, and
  see it on the site; a writer's publish refused with its reason; a new page
  from nothing to live.
- Not checked: a phone-width window (the browser window would not resize).

- Links on the Builder's canvas (a Button, a post card) are real `<a>`s, and
  the page editor's routing turns a followed link into a navigation. A click on
  one selects the Block and does not navigate: the canvas takes the click.
