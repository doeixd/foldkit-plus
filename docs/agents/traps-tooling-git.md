# Traps: git in the shared tree

Read before staging, committing, moving files, rebuilding a commit through a temporary index, or restarting a branch.

- **`git add -N` stages into the shared index.** Used so a review sees new
  files, it rides another session's next commit like any staging. Do not use
  it in a shared worktree; pass new files to the review another way.
- **The index is shared: stage and commit in one command.** Two sessions in
  one worktree share `git add`'s staging area, so files one session stages
  and leaves for a review step are swept into the other's next `git commit`.
  A whole phase of `foldkit-ssr` shipped under a Remote docs commit that way.
  Stage only in the command that commits, and commit with explicit paths
  (`git commit -- <paths>`) so nothing staged by someone else rides along.
  `git mv` stages as it moves: a `describe.ts` moved early in a bout rode
  the other session's next commit as a bare rename, its imports not yet
  fixed, and HEAD did not compile until the bout's own commit. Move a file
  in the command that commits it, or with a plain `mv`.
  The worktree is shared too: another session's checkout or revert can move
  files under you, so re-check `git status` at the start of a bout of work
  and after anything surprising — an edit whose old text matches twice, or a
  file that already contains the change, means the tree moved, not that the
  tool misbehaved.
- **Diff your paths right before a pathspec commit, not only at review.**
  Another session's hunk arrived in `index.ts` between a review and the
  commit, which shipped it, and `main` did not compile until a repair commit.
  Run `git diff -- <paths>` in the same command that commits.
- **A pathspec commit takes the working tree, not the index.** `git commit --
  <paths>` snapshots those paths as they are on disk: unstaging a foreign
  hunk (`git apply --reverse --cached`) does not keep it out, and it rode a
  Dialog test into an unrelated commit that way. Extract the foreign hunk
  from the file first (or wait), then commit.
- **Deleting a copy of the tree follows its junctions into this one.** A
  second checkout made to measure an old commit linked its `node_modules`
  entries to this tree's `.pnpm` store with junctions; `git worktree remove`
  failed partway and had already emptied 159 packages here (`effect`,
  `foldkit`, `vite`), so every agent's checks failed with "Cannot find
  module". Never link a second tree into this one's `node_modules`; to remove
  a folder that holds junctions, delete each junction itself first
  (`[System.IO.Directory]::Delete(path, $false)`), then the folder. The repair
  is `pnpm install --frozen-lockfile --force`, which needs free disk: a full
  disk (`ENOSPC`) left it half done.
- **Sessions share one scratchpad.** A commit's file built at a fixed name
  (`readme.mine`) for the temporary-index recipe was overwritten by another
  session between two commands, and the commit carried its README. Name
  scratch files uniquely (a PID or timestamp), and grep the committed blob
  before `update-ref`.
- **A commit built from HEAD's copy goes stale when HEAD moves.** A README
  built for a temporary-index commit from HEAD lost another session's text,
  committed between the read and `commit-tree`: `update-ref <new> <old>` checks
  only that HEAD did not move after OLD was read, not that the blob's base is
  HEAD. Read the base and `commit-tree` in one command, and diff the result
  against the previous commit before pushing. It happened three times in one
  day, once reverting twelve files (706e148c, restored by f03ec009). The rule:
  capture `OLD=$(git rev-parse HEAD)` once, build from `read-tree "$OLD"`, and
  pass the same `$OLD` to `update-ref`; then check `git diff --stat $OLD
  <new>` names only your files.
- **`git commit-tree` does not sign unless told to.** `commit.gpgsign` applies
  to `git commit` only, so every temporary-index commit went out unsigned and
  GitHub shows it Unverified (5fce21a5, 8a46cd79, 4675986b and more). Pass
  `-S`: `git commit-tree -S -p "$OLD" -m … "$TREE"`.
- **A new file committed through a temporary index needs `--add` in the real
  one.** `git update-index --cacheinfo` refuses a path the real index lacks;
  without `--add` it shows the file as a staged deletion plus an untracked
  copy.
- **`git apply --cached --unidiff-zero` places an insertion by the wrong line.** To commit
  only my hunks of files another session was editing too, I applied a zero-context patch
  holding just mine; a pure insertion (`@@ -4698,0 +5460,401 @@`) landed at its new-side
  number, past the foreign hunks left out, so 400 lines went inside `sheetDrawer` and a fold
  split in two, and `oxfmt --check` on the working tree (which was right) saw nothing. Build
  the staged file yourself (HEAD's blob with your hunks applied by content, `git hash-object
  -w` and `git update-index --cacheinfo`), diff it against the working tree to see only the
  foreign hunks remain, and parse `git show HEAD:<file>` after committing.
- **A hunk picked by its content can carry a neighbour's lines.** Choosing my
  hunks of `remote/src/index.ts` by a word in them took one where another
  session's new `RetainEntryOptions` sat three lines above my `timeout`, so
  `git diff` joined them; HEAD then named a `budget` its Model lacked and did
  not compile until a follow-up took it out. Pick hunks with `-U0`'s
  boundaries in view, and read `git show HEAD -- <file>` for lines you did not
  write before pushing.
- **But a pathspec that names only the new half of a rename ships both files.**
  `git mv old new` stages a rename; `git commit -- new` then commits the addition
  while the deletion of `old` stays in the index, so HEAD holds two copies and a
  later `git status` shows the bare deletion. Vitest reads the worktree (which has
  only `new`), so the suite stays green and proves nothing. Name both sides, or
  check `git show --stat -M HEAD` for the rename before committing; the same trap
  bit the `richtext-dom` move, and the fix was to amend so the commit matched the
  staged rename that was actually reviewed.
- **`git checkout -- <file>` drops every uncommitted change in it.** Used to
  take a debug line back out of a test, it also took the session's new tests
  in that file, which had to be written again. Copy the file aside (`cp`)
  before a temporary edit, and copy it back.
- **A rebase- or squash-merged PR leaves its branch behind `main` in name only.**
  GitHub's rebase merge writes every commit again under a new hash, so after
  PR #189 the session branch held the old copies and restarting it from `main`
  could only be pushed by force, which auto-mode refuses unless the user allows
  it. Keep the history linear and let GitHub delete a branch when its PR
  merges (Settings, General, "Automatically delete head branches"): restarting
  it is then a plain push that recreates it.
- **A shell variable is gone in the next Bash call.** `F="…"` set in one
  call and `git commit -m … -- $F` in the next committed only the files
  `git add` had staged (69cd3085), and the rest needed a second commit. Set
  the list and commit in one command, and read `git show --stat HEAD`.
- **Flags go before `--`, and new files need `git add`.** `git commit --
  <paths> -m` parses `-m` as a pathspec and fails, and a pathspec commit skips
  untracked files, so a new module rode an `--amend` into the wrong commit.
  Put `-m` before `--`, add new files first, and check `git show --stat HEAD`
  for strays.
