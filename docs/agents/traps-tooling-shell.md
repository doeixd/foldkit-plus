# Traps: the shell, scripted edits and formatting

Read before writing a file through a script, chaining commands with && or a pipe, or formatting.

## Writing source through scripts

Write source with the Edit or Write tool, never a heredoc, `sed` or Python. After any write that holds escapes, `grep -F` the literal and check bytes (`cat -A`, `repr`). Variants that bit:

- **Writing a file can turn `\u0000` into a raw NUL.**
  Rewriting Remote's requirement code whole emitted literal NUL bytes, so git showed `requirement.ts` as `Bin` and editors rendered the escape as an invisible character in `replace('\u0000', ' ')`. After writing control-character escapes, check `git diff --stat` for `Bin` and grep for the escape.
- **A `\\n` in a Python heredoc run through the Bash tool reaches the file as a newline.**
  Three scripted edits wrote a real line break into `'\n'` literals (`endsWith('\n')`, a mutation anchor, an e2e assertion); one compiled, inside a template literal, as a different string. A quoted bash heredoc (`cat <<'EOF'`) does it too: `'\\s'` in a mutation anchor and `'\\c'` in a test reached the files as `'\s'` and `'\c'`, which JavaScript reads as `s` and `c`. A `\\b` in a regex went through Python as `\b`, a backspace: three regexes held `^H` where the word boundary was (the Read tool does not show it). Use the Edit or Write tool (or `String.raw`), build a backslash with `chr(92)`, and check lines with `cat -A`.
- **Python's text mode writes CRLF on Windows.**
  Scripted edits with `open(p, 'w')` turned `tsconfig.json` and `vitest.config.ts` into CRLF files that failed `format:check`. Pass `newline=''` when reading and writing.
- **Python's default encoding here is cp1252, and `open(p, 'w')` truncates before it fails.**
  A scripted insert into `guard-DESIGN.md` hit a `→`, raised `UnicodeEncodeError` after the file was emptied, and the `git commit && git push` on the next line shipped a zero-byte document. Pass `encoding='utf-8'` on reads and writes, write only after the new content is fully built, and never chain a commit after a script: check `wc -c` or `git diff --stat` first.
- **A long heredoc through the Bash tool can fail to parse.**
  Two Python edit scripts of about 150 lines, quoted `<<'EOF'`, failed with "unexpected EOF while looking for matching `''" before running; shorter ones passed. Write the script with the Write tool and run the file.
- **Bulk and anchored edits replace every occurrence, miss silently, and land in the wrong place.**
  A scripted insert landed in two functions and broke an unrelated one; a later one matched nothing and quietly did not apply, so a field was absent. An end anchor found from the top can sit before the start one (`s.index('### 4. ')` met a numbered list earlier in TODO.md and `s[:i] + new + s[j:]` doubled the text between): search from the start anchor (`s.index(end, i)`) and assert `i < j`. Anchoring an insert on `export const X` lands it under X's doc comment (`holdsItem`, `isBlank`, `drawPlaceholder`; typecheck and tests cannot see it): anchor on the comment's opening `/**`. A prepend matching only the anchor line deletes it (changelog entry, doc section; every check stays green): end `old_string` on a line the new text keeps. Assert the anchor and re-read the diff and the region.

## Chaining commands and exit status

- **A pipe, `;`, a trailing `for` loop, a heredoc or a summary line each hide a failed check; chain checks into the commit with `&&` and read the exit status.**
  `prettier --check $F | tail -1 && git commit` committed a file the check had flagged (`tail` succeeded): redirect (`>/dev/null &&`) instead. `pnpm -s mutate:check >/dev/null; echo $?; …; git commit` printed `1` and committed, twice. `BLOB=$(build | git hash-object -w --stdin)` stored an empty blob when the building script failed its own assert and 0b76df63 committed the changelog emptied: write the built file to disk, check it (`wc -c`, grep for the entry), then hash the file. `pnpm -s format:check | tail -1` printed "Finished in 341ms on 3380 files" after "Format issues found" and an unformatted mutation spec failed CI lint: read `echo $?` or grep the verdict line. A `for` loop at the end of an `&&` chain gates nothing (its status is the last iteration's), and `git update-index --cacheinfo` needs `--add` for a new file. A heredoc ends the chain: `cp … && python - <<'EOF' … EOF` then `cp mine CHANGELOG.md && git commit` on the next line committed whatever `mine` an earlier run left when the script failed its assert: put the commit in a separate step after reading the script's output.
- **`timeout` from Git Bash leaves a `pnpm` script's grandchildren running on Windows.**
  A timed-out `pnpm dev` left tsx and workerd up. Kill the tree with `taskkill /T /F` and remove the `foldkit-workers-*` temp directory a killed stack leaves.

## Formatting

- **`pnpm format` rewrites every file in the shared tree; format your own files.**
  It formats `**/*.{ts,json,yaml}`, other sessions' unfinished files included: `pnpm exec oxfmt <paths>`, then check with `pnpm format:check`.
- **Format with `pnpm format`, never bare `oxfmt`, and Markdown is not formatted.**
  Bare `oxfmt` reads `.oxfmtrc.jsonc` but formats every file it knows (on 2026-10-16 it listed four `.html` pages, two `.mjs` scripts and the `.jsonc` config). Markdown is deliberately ignored (`.prettierignore`, which oxfmt reads): formatters pad table columns and reformat fenced code, rewriting illustrative snippets. A script that writes formatted files (`pnpm paths`, the `foldkit-plus` generator) calls oxfmt's `format()`, which discovers no config, so it reads `.oxfmtrc.jsonc` itself.

## Escapes the writing tools themselves change


- **The Write and Edit tools turn a `\u005c` escape into a backslash, and a
  Python `\0` in a Bash heredoc becomes a NUL.** A probe written with
  `String.raw` lost its `\u005c`, and a design-doc edit gained two raw NUL
  bytes (grep said "Binary file matches"). Build such characters with
  `String.fromCharCode(92)` or `chr(92)`, and check the bytes before
  committing.

- **A `\u` escape written into source by a script can become the character.**
  Writing `.replaceAll('<', '\\u003c')` through a heredoc left one backslash in
  the file, and `'<'` in TypeScript is `<` itself: the escape replaced `<`
  with `<`, silently. The same route turned a `` regex into a literal line
  separator, which ends the regex. Build such characters with
  `String.fromCharCode`, and check the bytes with `repr` before trusting the
  file. (The commit that met this, `9d395e1`, says a test caught it; reading the
  bytes did, and the test was shown to catch it afterwards by mutation.)
