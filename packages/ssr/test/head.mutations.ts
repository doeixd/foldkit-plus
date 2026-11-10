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

const headed = 'packages/ssr/test/headed.test.ts'

export default [
  edit(
    'SSR.headed takes markers wherever they are',
    index,
    '!after.startsWith(`<!--${STYLES_MARKER}-->`) &&',
    'false &&',
    [headed],
  ),
  edit(
    'SSR.headed takes the first open marker',
    index,
    'html.lastIndexOf(HEAD_OPEN, end)',
    'html.indexOf(HEAD_OPEN)',
    [headed],
  ),
  edit(
    'SSR.headed reads a raw-text root',
    index,
    'tag === undefined || HEADLESS_ROOTS.has(tag) || end === -1',
    'tag === undefined || end === -1',
    [headed],
  ),
  edit(
    "SSR.headed puts the meta before the body's </head>",
    index,
    'document.search(/<\\/head>/i)',
    "document.lastIndexOf('</head>')",
    [headed],
  ),
  edit(
    'a root that drops the meta is not refused',
    index,
    '  if (tag !== undefined && HEADLESS_ROOTS.has(tag)) return Result.fail(refused(tag))\n',
    '',
    [headed],
  ),
  edit(
    "a posted form's page carries no meta",
    index,
    '        ...(options.metaInRoot === true ? { metaInRoot: true } : {}),\n',
    '',
    [headed],
  ),
  edit('the entry carries no meta', index, '      metaInRoot: true,\n', '', [entry, head]),
  edit('the root carries no meta', index, '      options.metaInRoot === true', '      false', [
    entry,
    head,
  ]),
  edit(
    'SSR.headed moves nothing',
    index,
    'return `${document.slice(0, at)}${head}${document.slice(at)}`',
    'return document',
    [entry, head],
  ),
  edit(
    'SSR.headed copies the meta and leaves it in the body',
    index,
    'render({ ...application, html }, ...args)',
    'render(application, ...args)',
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
