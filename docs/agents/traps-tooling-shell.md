# Traps: the shell, scripted edits and formatting

Read before writing a file through a script, chaining commands with && or a pipe, or formatting.

- **The Write and Edit tools turn a `\u005c` escape into a backslash, and a
  Python `\0` in a Bash heredoc becomes a NUL.** A probe written with
  `String.raw` lost its `\u005c`, and a design-doc edit gained two raw NUL
  bytes (grep said "Binary file matches"). Build such characters with
  `String.fromCharCode(92)` or `chr(92)`, and check the bytes before
  committing.
- **Writing a file can turn `\u0000` into a raw NUL.** Moving Remote's
  requirement code by rewriting it whole emitted literal NUL bytes for the
  escapes, so git showed `requirement.ts` as `Bin` and editors rendered
  the escape as an invisible character in `replace('\u0000', ' ')`. After
  writing code that contains control-character escapes, check
  `git diff --stat` for `Bin` and grep for the escape.
- **A `\u` escape written into source by a script can become the character.**
  Writing `.replaceAll('<', '\\u003c')` through a heredoc left one backslash in
  the file, and `'<'` in TypeScript is `<` itself: the escape replaced `<`
  with `<`, silently. The same route turned a `` regex into a literal line
  separator, which ends the regex. Build such characters with
  `String.fromCharCode`, and check the bytes with `repr` before trusting the
  file. (The commit that met this, `9d395e1`, says a test caught it; reading the
  bytes did, and the test was shown to catch it afterwards by mutation.)
- **A `\\n` in a Python heredoc run through the Bash tool reaches the file as a newline.**
  Three scripted edits in one session wrote a real line break into `'\n'` string literals
  (`endsWith('\n')`, a mutation anchor, an e2e assertion); one compiled, inside a template
  literal, and read as a different string. A quoted bash heredoc (`cat <<'EOF'`) through the
  tool does it too: `'\\s'` in a mutation anchor and `'\\c'` in a test reached the files as
  `'\s'` and `'\c'`, which JavaScript reads as `s` and `c`. Write text holding escapes with the
  Edit or Write tool (or `String.raw`), and grep the result with `grep -F` before trusting it.
  A `\\b` in a regex went through Python as `\b`, a backspace: three regexes held `^H` where
  the word boundary was, which the Read tool does not show. Build a backslash with `chr(92)`,
  and check such lines with `cat -A`.
- **Python's text mode writes CRLF on Windows.** Scripted edits with
  `open(p, 'w')` turned `tsconfig.json` and `vitest.config.ts` into CRLF files
  that failed `format:check`. Pass `newline=''` when reading and writing.
- **Python's default encoding here is cp1252, and `open(p, 'w')` truncates
  before it fails.** A scripted insert into `guard-DESIGN.md` hit a `→` in the
  text, raised `UnicodeEncodeError` after the file was already emptied, and the
  `git commit && git push` on the next line shipped a zero-byte document. Pass
  `encoding='utf-8'` on both reads and writes, write to the file only after the
  new content is fully built, and never chain a commit after a script in one
  command: check `wc -c` or `git diff --stat` first.
- **`pnpm format` rewrites every file in the shared tree.** It formats
  `**/*.{ts,json,yaml}`, other sessions' unfinished files included. While
  others work in the tree, format your own files (`pnpm exec oxfmt <paths>`)
  and check with `pnpm format:check`.
- **Format with `pnpm format`, never bare `oxfmt`.** Bare `oxfmt` reads
  `.oxfmtrc.jsonc` too, but formats every file it knows, not only the
  script's `**/*.{ts,json,yaml}`: on 2026-10-16 it listed four `.html`
  pages, two `.mjs` scripts and the `.jsonc` config as unformatted. Markdown
  is deliberately ignored (`.prettierignore`, which oxfmt reads), because
  formatters pad table columns and reformat code inside fenced blocks,
  rewriting the documents' illustrative snippets. A script that writes
  formatted files (`pnpm paths`, the `foldkit-plus` generator) calls oxfmt's
  `format()`, which discovers no config, so it reads `.oxfmtrc.jsonc` itself.
- **Bulk edits replace every occurrence, and a missing anchor fails silently.** A
  scripted insert landed in two functions and broke an unrelated one; a later one
  matched nothing and quietly did not apply, so a field was simply absent. Assert
  the anchor, then re-read the diff -- not just the check. An end anchor
  found from the top can sit before the start one: `s.index('### 4. ')` met
  a numbered list earlier in TODO.md, and `s[:i] + new + s[j:]` doubled the
  text between. Search from the start anchor (`s.index(end, i)`) and assert
  `i < j`.
- **Anchoring an insert on `export const X` lands it under X's doc comment.** Three
  scripted inserts here (`holdsItem`, `isBlank`, `drawPlaceholder`) went in between a
  declaration and its comment, leaving each comment documenting the wrong thing; the
  typecheck and the tests cannot see it. Anchor on the comment's opening `/**`, or read the
  lines above the insert before committing.
- **A pipe hides the exit status of what it pipes.** `prettier --check $F | tail -1 &&
  git commit` committed a file the check had just flagged, because `tail` succeeded.
  Redirect instead (`>/dev/null &&`) when a check gates the next command.
  `;` gates nothing either: `pnpm -s mutate:check >/dev/null; echo $?; …;
  git commit` printed `1` and committed, twice in one session (a re-anchor
  and an ambiguous anchor each followed). Chain every check into the commit
  with `&&`, or read the output before committing.
  `BLOB=$(build | git hash-object -w --stdin)` stored an empty blob when the
  script building a temporary-index CHANGELOG failed its own assert, and
  0b76df63 committed the changelog emptied. Write the built file to disk
  first, check it (`wc -c`, a grep for the entry), then hash the file.
- **A check's last line is its summary, not its verdict.** `pnpm -s format:check | tail -1`
  printed "Finished in 341ms on 3380 files", the line after "Format issues found", and
  an unformatted mutation spec went to CI and failed lint. Read the exit status (`echo
  $?`) or grep the verdict line, never only the tail.
- **A `for` loop at the end of an `&&` chain gates nothing.** Its exit status is
  the last iteration's. And `git update-index --cacheinfo` needs `--add` for
  a new file.
- **A heredoc ends the `&&` chain.** `cp … && python - <<'EOF' … EOF` then
  `cp mine CHANGELOG.md && git commit` on the next line runs the commit even
  when the script failed its own assert, with whatever `mine` an earlier run
  left. Put the commit in a separate step after reading the script's output.
- **A prepend that matches only the anchor line deletes it.** Matching the first
  line of a block (a changelog entry, a doc section) and replacing it with new
  text drops that line; the file stays valid and every check stays green, so
  only re-reading the region catches it. End `oldString` on a line the new
  text keeps, and re-read the region after editing.
- **`timeout` from Git Bash leaves a `pnpm` script's grandchildren running on
  Windows.** A timed-out `pnpm dev` left tsx and workerd up. Kill the tree with
  `taskkill /T /F`, and remove the `foldkit-workers-*` temp directory a killed
  stack leaves.
- **A long heredoc through the Bash tool can fail to parse.** Two Python
  edit scripts of about 150 lines, quoted `<<'EOF'`, failed with "unexpected
  EOF while looking for matching `''" before running; shorter ones passed.
  Write such a script with the Write tool and run the file.
