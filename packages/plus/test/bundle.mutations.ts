/**
 * The skill and guides the package ships, and the commands over them, broken
 * in turn: `pnpm mutate packages/plus/test/bundle.mutations.ts`. `cli.ts` is
 * not here: `cli.test.ts` builds it with tsdown from the disk, where these
 * edits never reach.
 */
const edit = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

const bundle = (name: string, find: string, replace: string) =>
  edit(name, '../scripts/bundleDocs.ts', find, replace, ['packages/plus/test/bundleDocs.test.ts'])
const skill = (name: string, find: string, replace: string) =>
  edit(name, '../src/skill.ts', find, replace, [
    'packages/plus/test/skill.test.ts',
    'packages/plus/test/project.test.ts',
  ])
const project = (name: string, find: string, replace: string) =>
  edit(name, '../src/project.ts', find, replace, ['packages/plus/test/project.test.ts'])

export default [
  bundle(
    'a design note is shipped as a guide',
    String.raw`/^docs\/([^/]+\.md)$/.exec(file)`,
    String.raw`/^docs\/(.+\.md)$/.exec(file)`,
  ),
  bundle('a guide is listed once per source', '...new Set(', '...Array.from('),
  bundle(
    'a link to a shipped guide is sent to GitHub',
    'if (guide !== undefined && shipped.includes(guide)) return `${guide}${suffix}`',
    'if (guide === undefined) return `${guide}${suffix}`',
  ),
  bundle('an anchor is dropped from a rewritten link', '${resolved}${suffix}', '${resolved}'),
  bundle('an absolute link is rewritten', 'if (SCHEME.test(target)) return target', ''),
  bundle(
    'links in code fences are rewritten',
    "if (fence !== '' || marker !== undefined) return line",
    '',
  ),
  bundle(
    'the skill keeps its links to main',
    '.replaceAll(`${REPOSITORY}/blob/main/`',
    '.replaceAll(`${REPOSITORY}/blob/mainx/`',
  ),
  bundle(
    'the tag is the changelog without its v',
    'version === undefined ? undefined : `v${version}`',
    'version === undefined ? undefined : version',
  ),
  skill(
    'a newer skill reads as older',
    'const difference = (x[at] ?? 0) - (y[at] ?? 0)',
    'const difference = (y[at] ?? 0) - (x[at] ?? 0)',
  ),
  skill(
    'versions compare as text',
    'parts = (version: string) => version.split(/[.-]/).map(part => Number.parseInt(part, 10))',
    'parts = (version: string) => version.split(/[.-]/).map(part => part.charCodeAt(0))',
  ),
  skill(
    'a different version is written over unforced',
    ": force\n          ? 'replace'",
    ": true\n          ? 'replace'",
  ),
  skill('a skill of another name counts as ours', 'found.ours && Option.exists', 'Option.exists'),
  skill('the same version is not left alone', "? 'current'", "? 'replace'"),
  project(
    'the project skill is read in place of the shipped one',
    'const shipping = [...Option.toArray(plus), ',
    'const shipping = [...Option.toArray(Option.none<string>()), ',
  ),
  project(
    'the CLI copy outranks the installed one',
    '[...Option.toArray(plus), ...(ownDir === undefined ? [] : [ownDir])]',
    '[...(ownDir === undefined ? [] : [ownDir]), ...Option.toArray(plus)]',
  ),
  project('guides are not read', "...markdownIn(join(dir, 'guides'))", '...[].map(String)'),
  project(
    'a held skill folder is not preferred',
    'return held.length > 0 ? held : [',
    'return [...held, ',
  ),
  project(
    'an existing folder is replaced without removing it first',
    'rmSync(target, { recursive: true, force: true })',
    '',
  ),
  project('the shipped version is not checked on install', "plan === 'refuse'", "plan === 'never'"),
]
