/**
 * `docs`, broken in turn:
 * `pnpm mutate packages/plus/test/docs.mutations.ts` checks that a test fails
 * for every one.
 */
const docsTests = ['packages/plus/test/docs.test.ts']
const projectTests = ['packages/plus/test/project.test.ts']

const edit = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

const docs = (name: string, find: string, replace: string) =>
  edit(name, '../src/docs.ts', find, replace, docsTests)
const project = (name: string, find: string, replace: string) =>
  edit(name, '../src/project.ts', find, replace, projectTests)

export default [
  docs('a heading in code is a section', "fence = fence === '' ? marker : ''", "fence = ''"),
  docs(
    'a shorter fence closes a longer one',
    'marker[0] === fence[0] && marker.length >= fence.length',
    'marker[0] === fence[0]',
  ),
  docs('a repeated anchor is not numbered', 'seen === 0 ? base :', 'true ? base :'),
  docs(
    'words are compared unstemmed',
    'return ending !== null && word.length',
    'return ending === "never" && word.length',
  ),
  docs(
    'a heading counts as much as a body',
    'const HEADING_WEIGHT = 3',
    'const HEADING_WEIGHT = 1',
  ),
  docs('the query as written earns nothing', 'score === 0 ? 0 : score + bonus', 'score'),
  docs('a section sharing no word is kept', '.filter(each => each.score > 0)', ''),
  docs('a lowercase word is a symbol', '&& /[.A-Z]/.test(query)', ''),
  docs(
    '`$` in a name is read as an anchor',
    'const literal = (name: string) => name.replaceAll(',
    'const literal = (name: string) => name ?? name.replaceAll(',
  ),
  docs(
    'a comment is taken from whatever is above',
    "if (above !== '*/' && !(above.startsWith('/**') && above.endsWith('*/'))) return []",
    '',
  ),
  docs('a signature ends at its first `;`, brackets open or not', 'if (depth <= 0 && /', 'if (/'),
  docs(
    "a declared owner's missing member is found in another",
    'if (owners.length > 0) return inside',
    '',
  ),
  docs(
    'declarations ignore which package answered best',
    '.sort((x, y) => standing(x.topic) - standing(y.topic))',
    '',
  ),
  docs('a cut section leaves its fence open', "...(fences % 2 === 1 ? ['```'] : []),", ''),
  docs('an unknown topic outlines nothing, as if found', '? Option.none()', "? Option.some('')"),
  project(
    'a copy above the project stands for what foldkit-plus brings',
    'const named = project.value.versions[name] !== undefined',
    'const named = true',
  ),
  project(
    "foldkit-plus's own dependencies are not looked for beside it",
    'Option.flatMap(plus, at => installedFrom(at, name)),',
    'Option.none(),',
  ),
  project('a named package that is missing passes', 'if (named)', 'if (false)'),
  project(
    "foldkit-plus's re-exported types are searched too",
    ".filter(each => each.name !== 'foldkit-plus')",
    '',
  ),
  edit(
    'setup does not name the docs command',
    '../src/setup.ts',
    'run `npx foldkit-plus docs <symbol or words>`',
    'read the references',
    ['packages/plus/test/setup.test.ts'],
  ),
]
// `cli.ts` is not here: `cli.test.ts` builds it with tsdown from the disk,
// where these edits never reach. A search that found nothing reporting
// success was checked by hand: that test goes red.
