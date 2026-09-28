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
Typing that carries on the tab's own last insert extends it rather than minting a new
one, so a burst the server has not seen yet goes out as one `Insert`.

Another person's edit arrives the other way. An exchange brings it to the replica,
`Sync.mount` reinstalls the pages, and `onReinstall` (`reinstalled` in `src/app.ts`)
patches the open editor from what it showed to what the page now projects to, with the
caret placed again by the characters it was held by.

When both people type at one place, both texts survive, the later-committed first. Text
typed into a block someone else deleted goes with the block. A deleted page goes to the
trash rather than away: edits that arrive for it still apply, so someone who typed into it
offline has not lost the text, and restoring the page from the sidebar brings it back.

Presence shares the sync connection. Each tab announces its open page and its anchored
caret, and draws the others' carets on the page it shows through the editor's `overlay`.
They are resolved against the page as it is now, so each caret keeps to the characters it
was held by while anyone types. A tab announces only when its page or caret changed, and
at most every 50 ms (`throttle`), sending the latest; nothing of presence is journaled,
and a tab that goes quiet drops out after 30 seconds.

Undo takes back this tab's own edits and leaves everyone else's. Each edit is recorded, in the
tab's Model, as the ops that reverse it (`Replicated.invert`); a run of typing is one step,
until the caret is put somewhere else.
Undo applies those ops as a new edit, which travels and converges like any other, and records
their own inverse for redo. A snapshot undo would restore a document the others have moved on
from, so the editor's own history is not used.

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
pnpm --filter foldkit-example-pages run server   # the journal, on ws://127.0.0.1:8787
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

- Deleted text is kept, as tombstones, until the server collects it: hourly,
  `journal.collect()` commits a `Collect` op for each page that holds deleted text. Only
  the server may; the journal refuses a tab's. A tab offline across two collections finds
  the deleted text it anchored on gone, and its typing there lands at the end of the block,
  or of the block that one was joined into. An undo from before then restores less.
- A new replica replays the whole history, 500 edits per exchange; the server sends no
  checkpoint, because it never compacts.
- Titles are last-writer-wins by the server's order. Renames the server has not seen yet
  are merged into one, as typing in the body is (`coalesce` in `src/contract.ts`).
- The server takes a tab's name, from the socket URL, as its identity, and accepts only
  `tab-…` names. Nothing authenticates it: a real deployment does. The journal binds each
  replica to the first name that commits from it, so a connection under another name
  cannot send edits as that replica, but one that claims the same name can.
- A tab's outbox lives in IndexedDB under the tab's name, which the tab keeps in
  `sessionStorage`: a reload finds it again, but a tab closed while offline leaves its
  unsent edits there, and no later tab reads them.
- Deleting `pages.sqlite` gives the server a new epoch. A tab that comes back rebuilds from
  the new, empty history and sends what was still waiting in its outbox. Everything the
  old server had committed is gone, on every tab.
