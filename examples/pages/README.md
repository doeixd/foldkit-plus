# Pages: collaborative rich text, local-first

A small page editor in the spirit of Notion: a list of pages, each a rich-text document
that two people can edit at the same time, online or not. It shows how
`foldkit-richtext`'s `Replicated` state, the editor from `foldkit-richtext-dom`, and
`foldkit-sync` with `foldkit-durable` fit together, and what each one owns.

## Who owns what

```text
foldkit-durable     the order: one journal every edit is appended to
foldkit-sync        the replica: its outbox, what is committed, what is pending
RichText.Replicated character identity: edits restated so they survive others' edits
foldkit-richtext-dom the contenteditable subtree, patched in place rather than rebuilt
this application    the pages in its Model, and turning editor edits into durable ones
```

The pages are the Sync document's shared slice, and each page's body is a
`Replicated` state. The editor never sees that state: it edits the plain `Document`
the state projects to, as it would any document.

## One keystroke

```text
key -> editor Message -> Editor.update runs the command on the projection
    -> Replicated.translate: the edit as ops naming characters, not offsets
    -> Sync.fact(EditedPage { ops })  applied in this same transition, then persisted
    -> patchTo: the editor patched to what the new state projects to
```

`update`'s `GotEditor` case (`src/app.ts`) does all of it. The ids a translation needs
are minted from the tab's `session` and a counter in the Model, which is why the fact
goes through `Sync.fact`: a later keystroke must read the Model with this one's counter.

Another person's edit arrives the other way. An exchange brings it to the replica,
`Sync.mount` reinstalls the pages, and `onReinstall` (`reinstalled` in `src/app.ts`)
patches the open editor from what it showed to what the page now projects to, with the
caret placed again by the characters it was held by.

When both people type at one place, both texts survive, the later-committed first. Text
typed into a block someone else deleted goes with the block.

## Run it

The two-replica trace, which is what CI runs:

```bash
pnpm --filter foldkit-example-pages demo
```

Alice starts a page and both people edit it without seeing each other; Bob reaches the
server first. It prints each replica's page as Markdown before and after they exchange,
and asserts that both replicas and the server agree.

The browser app needs the packages built (`pnpm build`) and two processes:

```bash
pnpm --filter foldkit-example-pages server   # the journal, on ws://127.0.0.1:8787
pnpm --filter foldkit-example-pages dev      # the page, on http://127.0.0.1:5173
```

Open the page in two windows (or one private) and edit one page from both. Stop the
server and keep typing: the edits stay in the tab's IndexedDB outbox, through a reload,
and reach the other window once the server is back.

## Files

- `src/app.ts`: the Model, the Messages (which are durable and which are local), and
  `update`, including the collaborative glue.
- `src/contract.ts`: the Sync contract and the mount.
- `src/journal.ts`: the server's Durable journal and the exchange a transport calls.
- `src/view.ts`: the page list, title, toolbar, editor, and a Markdown preview.
- `src/demo.ts`, `src/browser.ts`, `src/server.ts`: the trace, the browser entry, the
  sync server.
- `test/pages.test.ts`: one tab mounted, another replica headless, meeting in the
  journal.

## Limits

- There is no undo: the editor's undo restores a snapshot of this tab's document, which
  other people's edits have moved on from, and collaborative undo is not built.
- Deleted characters are kept as tombstones for good; nothing collects them yet.
- Every edit costs work in proportion to all pages: the journal rewrites the whole snapshot
  on each append, and a new replica reads the whole history, with no paging or checkpoint.
- Titles are last-writer-wins by the server's order. Keystrokes the server has not seen
  yet are merged into one edit, as typing in the body is (`coalesce` in
  `src/contract.ts`).
- An edit to a page another replica deleted is accepted and changes nothing.
- The server takes a tab's name as its identity and does not check that an operation's
  replica is the tab that sent it; a real deployment authenticates the connection.
- Deleting `pages.sqlite` while tabs keep their IndexedDB leaves those replicas ahead of
  the server, and their exchanges fail until the site's data is cleared too.
