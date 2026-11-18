# Traps: git in the shared tree

Read before staging, committing, moving files, rebuilding a commit through a temporary index, or restarting a branch. The rules these come from are in `AGENTS.md` ("Git in the shared tree").

## The index and the worktree are shared

- **Stage and commit in one command, with explicit paths.**
  Two sessions share `git add`'s staging area, so files one session stages for a later review ride the other's next `git commit` (a whole `foldkit-ssr` phase shipped under a Remote docs commit; `git add -N`, used so a review sees new files, does the same). `git mv` stages as it moves: a `describe.ts` moved early rode another session's commit as a bare rename with its imports unfixed, and HEAD did not compile until the bout's own commit. Move a file in the command that commits it, or with a plain `mv`. The worktree is shared too: another session's checkout or revert can move files under you, so re-check `git status` at the start of a bout and after anything surprising (an edit whose old text matches twice, a file that already holds the change means the tree moved).
- **Diff your paths right before a pathspec commit.**
  Another session's hunk arrived in `index.ts` between a review and the commit and shipped; `main` did not compile until a repair commit. Run `git diff -- <paths>` in the command that commits.
- **A pathspec commit takes the working tree, not the index.**
  `git commit -- <paths>` snapshots those paths from disk, so unstaging a foreign hunk (`git apply --reverse --cached`) does not keep it out (it rode a Dialog test into an unrelated commit). Extract the foreign hunk from the file first, or wait.
- **A pathspec that names only the new half of a rename ships both files.**
  `git mv old new` then `git commit -- new` commits the addition while the deletion of `old` stays in the index, so HEAD holds two copies and a later `git status` shows the bare deletion (Vitest reads the worktree and stays green). Name both sides or check `git show --stat -M HEAD` for the rename; it also bit the `richtext-dom` move, fixed by amending so the commit matched the reviewed rename.
- **Flags go before `--`, and new files need `git add` first.**
  `git commit -- <paths> -m` parses `-m` as a pathspec, and a pathspec commit skips untracked files (a new module rode an `--amend` into the wrong commit). Put `-m` before `--`, add new files first, and read `git show --stat HEAD` for strays.
- **A shell variable is gone in the next Bash call.**
  `F="…"` in one call and `git commit -m … -- $F` in the next committed only what `git add` had staged (69cd3085) and needed a second commit. Set the list and commit in one command.
- **`git checkout -- <file>` drops every uncommitted change in it.**
  Used to take a debug line out of a test it also took the session's new tests in that file. Copy the file aside (`cp`) before a temporary edit and copy it back.
- **Sessions share one scratchpad.**
  A commit's file built at a fixed name (`readme.mine`) was overwritten by another session between two commands and the commit carried its README. Name scratch files uniquely (a PID or timestamp) and grep the committed blob before `update-ref`.

## Committing through a temporary index (my hunks of shared files)

Checklist, each item from a commit that went wrong:

- **Capture `OLD=$(git rev-parse HEAD)` once, build from `read-tree "$OLD"`, pass the same `$OLD` to `update-ref`,** then check `git diff --stat $OLD <new>` names only your files.
  A README built from HEAD's copy lost another session's text committed between the read and `commit-tree` (`update-ref <new> <old>` checks only that HEAD did not move after OLD was read): three times in one day, once reverting twelve files (706e148c, restored by f03ec009).
- **Pass `-S` to `git commit-tree -S -p "$OLD" -m … "$TREE"`.**
  `commit.gpgsign` applies to `git commit` only, so temporary-index commits went out unsigned and GitHub shows them Unverified (5fce21a5, 8a46cd79, 4675986b and more).
- **A new file needs `git update-index --add --cacheinfo`.**
  Without `--add` it refuses a path the real index lacks and shows a staged deletion plus an untracked copy.
- **Build the staged file yourself; do not `git apply --cached --unidiff-zero`.**
  A pure-insertion hunk (`@@ -4698,0 +5460,401 @@`) landed at its new-side number past the foreign hunks left out, so 400 lines went inside `sheetDrawer` and a fold split in two, while `oxfmt --check` on the working tree saw nothing. Take HEAD's blob with your hunks applied by content, `git hash-object -w` and `git update-index --cacheinfo`, diff it against the working tree to see only the foreign hunks remain, and parse `git show HEAD:<file>` after committing.
- **A hunk picked by its content can carry a neighbour's lines.**
  Choosing my hunks of `remote/src/index.ts` by a word took one where another session's new `RetainEntryOptions` sat three lines above my `timeout`, so `git diff` joined them and HEAD named a `budget` its Model lacked until a follow-up. Pick hunks with `-U0` boundaries in view and read `git show HEAD -- <file>` for lines you did not write before pushing.

## Trees and branches

- **Deleting a copy of the tree follows its junctions into this one.**
  A second checkout made to measure an old commit linked its `node_modules` entries to this tree's `.pnpm` store with junctions; `git worktree remove` failed partway after emptying 159 packages here (`effect`, `foldkit`, `vite`) and every agent's checks failed with "Cannot find module". Never link a second tree into this one's `node_modules`; delete each junction itself first (`[System.IO.Directory]::Delete(path, $false)`), then the folder. The repair is `pnpm install --frozen-lockfile --force`, which needs free disk (a full disk, `ENOSPC`, left it half done).
- **A rebase- or squash-merged PR leaves its branch behind `main` in name only.**
  GitHub's rebase merge writes every commit again under a new hash, so after PR #189 the session branch held the old copies and restarting it from `main` could only be pushed by force, which auto-mode refuses. Keep history linear and let GitHub delete head branches on merge (Settings, General, "Automatically delete head branches"): restarting is then a plain push that recreates it.
