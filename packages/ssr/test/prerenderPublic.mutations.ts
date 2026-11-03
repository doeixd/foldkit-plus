/**
 * A prerendered page held to the page cache's rule (#469), each part of the
 * rule broken in turn: `pnpm mutate packages/ssr/test/prerenderPublic.mutations.ts`
 */
const tests = ['packages/ssr/test/prerenderPublic.test.ts']
const entry = '../src/index.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: entry, find, replace }],
  tests,
})

export default [
  // Which requests the rule holds.
  edit(
    'an entry with no cache renders a prerendered page per request',
    'prerendering(request) ? prerender(request) : answer(request)',
    'answer(request)',
  ),
  edit(
    'an entry with a cache renders a prerendered page per request',
    'if (prerendering(request)) return prerender(request)',
    '',
  ),
  edit(
    'every method at a prerendered path is held to it',
    "return (method === 'GET' || method === 'HEAD') && matchOf(request.url) === 'path'",
    "return matchOf(request.url) === 'path'",
  ),
  edit(
    'every path is held to it',
    "return (method === 'GET' || method === 'HEAD') && matchOf(request.url) === 'path'",
    "return method === 'GET' || method === 'HEAD'",
  ),
  // What the rule refuses.
  edit('a status other than 200 passes', 'if (status !== 200) return', 'if (false) return'),
  edit('a render that read every header passes', 'if (watched.read.all) {', 'if (false) {'),
  edit('a private read passes', "if (read._tag === 'Private') {", 'if (false) {'),
  edit(
    'a header read by name passes',
    'watched.read.names.size === 0\n          ? Option.none()',
    'true\n          ? Option.none()',
  ),
  edit('a header set passes', 'set.length === 0 ? Option.none()', 'true ? Option.none()'),
  // What a refused or rendered page says.
  edit(
    'a page that passes keeps its headers',
    'return Rendered(result.application)',
    'return result',
  ),
  edit(
    'two headers read are named as one',
    "header${watched.read.names.size > 1 ? 's' : ''}",
    'header',
  ),
  edit(
    'names are run together',
    "names.length < 2 ? names.join('')",
    "names.length < 99 ? names.join('')",
  ),
]
