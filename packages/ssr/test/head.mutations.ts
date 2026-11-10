/**
 * A dynamically served page's head (`SSR.entry`, `SSR.headed`, `SSR.hydrate`),
 * broken in turn: `pnpm mutate packages/ssr/test/head.mutations.ts`.
 */
const index = '../src/index.ts'
const client = '../src/client.ts'
const entry = 'packages/ssr/test/entry.test.ts'
const head = 'packages/ssr/test/head.test.ts'
const edit = (name: string, file: string, find: string, replace: string, tests: string[]) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('the entry carries no meta', index, '      metaInRoot: true,\n', '', [entry, head]),
  edit('the root carries no meta', index, '      options.metaInRoot === true', '      false', [
    entry,
    head,
  ]),
  edit(
    'SSR.headed moves nothing',
    index,
    '    if (start === -1) return document',
    '    return document',
    [entry, head],
  ),
  edit(
    'SSR.headed copies the meta and leaves it in the body',
    index,
    '`${document.slice(0, start)}${document.slice(end + HEAD_CLOSE.length)}`',
    'document',
    [entry],
  ),
  edit(
    'a page left unmoved goes unreported',
    client,
    '    if (dropUnmovedHead(root)) report(headNotMoved)\n',
    '    dropUnmovedHead(root)\n',
    [head],
  ),
  edit('the meta stays in the root', client, ') node.remove()', ') void node', [head]),
]
