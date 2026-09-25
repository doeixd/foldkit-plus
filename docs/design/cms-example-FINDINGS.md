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
   *Proposed:* make `variants` optional, defaulting to `{}`.
   Status: worked around.

2. **A Selection's value has no name.** `Entity.select(Post, {...})` has no
   `.Type`; the value type is `typeof PostCard.schema.Type`, which a reader has
   to find in the source. *Proposed:* an `Entity.Selected<typeof S>` type (or
   `.Type` on the Selection, like a Schema). Status: worked around.

3. **`query<Principal>(descriptor, …)` in `foldkit-remote-drizzle` loses the
   input type.** Naming the principal type argument makes TypeScript default
   the second one (`Input`) to `unknown`, and the descriptor no longer fits:
   "not assignable to `QueryDescriptor<string, unknown, unknown>`". The caller
   has to spell `query<Principal, typeof RecentPosts.Input.Type>(…)`, as
   `cms-drizzle` does internally. *Proposed:* take the principal from the
   binding or put `Input` first so it is inferred, or a curried
   `query.for<P>()(descriptor, …)`. Status: worked around.

4. **`Renderer.render`'s options refuse `undefined`.** Under
   `exactOptionalPropertyTypes`, `{ data: reads?.read(model) }` is an error, so
   every caller writes `data === undefined ? {} : { data }` (the page demo and
   the site view both do). *Proposed:* type the optional fields `| undefined`.
   Status: worked around.

5. **A `Renderer<…, never>` cannot draw into an application's builder.**
   `HtmlBuilder` is invariant in its Message, so the site view cannot pass its
   own `h`; it draws with `inertHtml`, as the Builder's canvas does. That works
   (the result is plain `Html`), but nothing says so. *Proposed:* document it in
   the composition README's "Drawing a page", or let `render` accept any builder
   when the Renderer sends nothing. Status: worked around.

6. **The inspector draws a number-literal prop as text it cannot edit.**
   `Schema.Literals([3, 5])` resolves to no control (only string literals make a
   `Select`), so `LatestPages.count` shows `3` as code. The new Blocks use string
   literals (`'3' | '6' | '9'`) to get a select. *Proposed:* the inspector (or
   `Input.resolve`) offers a select for number literals and stores the number.
   Status: worked around.

7. **An unsaved new entry had no public name.** Writing the open entry into the
   address put a page's id there before its first save, so a reload asked for
   an entry the server did not have. **Fixed** in `dcaf658`:
   `placed.storedEntry(model)`.

8. **Routing callbacks lose inference inside `placements.complete`.**
   `makeApplication`'s `routing.onUrlChange: url => …` and `init: url => …`
   need `(url: Url)` written out, or `complete`'s checks report a misleading
   "update does not accept every placement's Messages". Status: worked around;
   *proposed:* check whether `complete` can infer the config before it checks.

9. **Seeding content means writing the CMS's tables by hand.** There is no
   server-side way to create a published entry (row, entry, revision) without a
   client session, so `seed.ts` inserts into `cms_entries` and `cms_revisions`
   itself and must match what a publish writes. *Proposed:* a `CmsServer`
   import or seed operation. Status: worked around.

10. **An active read written by hand repeats `owner: Data.contract.owner ?? {}`.**
    The `?? {}` is a quiet fallback (AGENTS.md De-slop), and the object shape
    (`name`, `owner`, `messages: []`, `projectionOf`) is repeated for every
    read. The site app uses `App.owner` in a small `reading` helper instead.
    *Proposed:* `Data.active(name, projectionOf)` in Remote. Status: worked
    around.

11. **A preview that lacks a selected field reads as `Initial`, silently.**
    The post preview overlays the form's value on Remote's store. When the
    page's selection gained `publishedAt`, which a form value does not hold,
    the preview of a new post read `Initial` forever, with nothing saying a
    field was missing. The posts demo caught it; a browser would just show an
    empty pane. The example now previews through `PostPreview`, which selects
    only what the form holds. *Proposed:* Remote reports an overlay that cannot
    satisfy a selection (in development, at least), or the read says which
    field it is waiting for.

12. **Casts left in the example point at API gaps.** None is new, but each is
    a place a user would cast too:
    - `Worklist.active.projectionOf(model)!` (`app.ts`): a Crud list's active
      always has a projection, but its type says it may not.
    - `effect.pipe(…) as never` and `{ … } as never` (`demo.ts`), around
      `RemoteServer.handlers` results and a hand-made client service.
    - `(yield* DrizzleDatabase) as unknown as Writes` (`server.ts`): the
      database service is not typed for a plain `insert`/`update` in a handler.
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
    0.x. Status: example converted; packages proposed.

14. **The inspector asked the decoded side whether a prop may be empty.**
    Found by item 13: with `FeaturedPost.post` typed
    `Schema.OptionFromNullOr`, the relation picker lost its blank, because
    `Schema.is(schema)(null)` checks the decoded type (`Option`), while the
    Builder stores the encoded side (`null`). **Fixed:** the check is
    `Schema.is(Schema.toEncoded(schema))(null)`, and the mixins-builder fixture's
    `category` is `OptionFromNullOr`, so the test covers it (reverting the fix
    fails it).

15. **`accent.text` reads as "accent-colored text" and is the opposite.**
    `Theme.oklch`'s `<family>.text` (`accent.text`, `error.text`, `info.text`,
    …) is the text color *on* the family's full fill, computed for contrast
    (white on a mid accent). The example used it for colored text on a light
    surface, and the site's "Featured" label, its "Read the post" link and the
    current nav item came out nearly white; the error colors and state badges
    had the same mistake. mixins-ui's own recipes use it correctly, as
    `onFill`. *Proposed:* rename it `onFill` (or `on`), matching the recipes, and
    say in the theme docs which token is for colored text (`default`, or a
    `text` that means it). Status: example fixed (uses `default`).

16. **The button recipe left a link underlined.** `Recipes.Button` on an `<a>`
    (mixins-ui's `Anchor`, or a Block's link button) kept the element
    defaults' underline and link color on its label. **Fixed** in the recipe:
    `textDecoration: 'none'`.

17. **The element defaults color every heading.** `Defaults.headings` sets
    `color: text-overt` on `h1`–`h6`, so a heading inside a colored band (the
    Hero's accent tone) stays dark unless its own style says `inherit`. That is
    a reasonable default, but a Block author meets it as "my title is the wrong
    color". *Proposed:* headings inherit, with `text-overt` on `body` content
    only, or a note in the defaults' docs. Status: worked around (`color:
    inherit` on the Hero's title).

18. **The CMS's address control has no Slots of its own.**
    `Cms.controlRenderers()` draws the slug as a bare `span` holding a prefix
    `span` and the `text` slot's input. With the input full width, the prefix
    sat on its own line above it, and the only handle to fix that was the
    `data-cms-slug-prefix` attribute. *Proposed:* publish the group and the
    prefix as Slots (or draw them in `FieldSlots.control`), so an application
    styles them like any other part. Status: worked around with a nested
    selector in the example's `FieldStyle`.

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
    `calc(var(--fk-tree-level) * 1rem)` indents any depth. Status: worked
    around.

22. **A Query Block showed more rows than its `first`.** In the page editor,
    the PostList (3 posts) showed all four on the canvas, while the public site
    showed three. Remote keys a connection by query and input, not window, so
    the picker's read of the same list (`first: 50`) filled the connection, and
    the Block's `first: 3` read got every row it held. **Fixed** in
    `QueryBlock.reads`: each node's read is cut to its own `first`, with
    `hasNext` set when rows were cut. `remote.test.ts` reads a wider window of
    the same query first and asserts the Block still gets its two; it fails
    without the fix.

23. **The canvas's hover mark hid the selection mark.** A node under the
    pointer is hovered and selected at once, and the example's hover rule came
    later, so the selection drew as the hover's dashed line, and in the accent
    color on an accent Hero, invisibly. Fixed in the example (selection drawn
    last, in a warm color). *Proposed:* the mixins-builder README's CSS snippet
    orders the two rules this way and says why.

## Checked in the browser

- Links on the Builder's canvas (a Button, a post card) are real `<a>`s, and
  the page editor's routing turns a followed link into a navigation. A click on
  one selects the Block and does not navigate: the canvas takes the click.
