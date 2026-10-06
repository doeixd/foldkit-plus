/**
 * Every published demo, written once. The site draws a card from each, every
 * demo draws its own intro from its entry (`intro.ts`), and the root README's
 * list of demos is generated from them (`readme.ts`). `test/demos.test.ts`
 * keeps the README equal to this list and checks that every file a demo names
 * exists.
 */

/** One thing to try: a word for it, and what to do. */
export interface Step {
  readonly title: string
  readonly text: string
}

export interface Demo {
  readonly title: string
  /** Where it is published. */
  readonly url: string
  /** Its example, from the repository root. */
  readonly example: string
  /** One sentence: what the demo proves. */
  readonly proves: string
  /** What to try, in order. */
  readonly tryThis: readonly [Step, ...ReadonlyArray<Step>]
  /** The file to read first, from the repository root. */
  readonly readFirst: string
  /** The packages it shows, as `packages/` names them. */
  readonly packages: ReadonlyArray<string>
}

export const cmsDemo: Demo = {
  title: 'A blog studio and its site',
  url: 'https://foldkit-cms-demo.pages.dev/',
  example: 'examples/cms',
  proves:
    'Drafts beside the row, revisions, scheduled publishing and a page builder, with the public site rendered at build time.',
  tryThis: [
    {
      title: 'Write',
      text: 'As Wren, a writer, start a post. It saves as you type; a writer cannot publish.',
    },
    { title: 'Publish', text: 'Switch to Edda, an editor, open it and publish it.' },
    { title: 'Read', text: 'View the site as a visitor: only what was published is there.' },
    {
      title: 'Build',
      text: 'In Pages, open Home and build it from blocks; publish, then look again.',
    },
  ],
  readFirst: 'examples/cms/src/server/server.ts',
  packages: ['cms', 'cms-drizzle', 'remote', 'crud', 'form', 'builder', 'ssr'],
}

export const registryDemo: Demo = {
  title: 'Two devices, one registry',
  url: 'https://foldkit-registry-demo.pages.dev/',
  example: 'examples/registry',
  proves:
    'Two devices edit 10,000 products in a data grid, offline and in conflict, and agree once both are back.',
  tryThis: [
    { title: 'Edit', text: 'Change a price in Device A. It shows in Device B a moment later.' },
    {
      title: 'Conflict',
      text: 'Tick “Work offline” in Device B, edit the same price in both, then untick it. The later edit wins, and the device that lost says so.',
    },
    {
      title: 'Reload',
      text: 'Reload Device B while it is offline. Its edits are still waiting, and go when it is back.',
    },
    {
      title: 'Undo',
      text: 'Press Ctrl+Z on a device’s grid to take its last edit back. It goes as a new edit, and a cell the other device changed since is left alone.',
    },
  ],
  readFirst: 'examples/registry/src/domain.ts',
  packages: ['data-grid', 'mixins-data-grid', 'remote', 'sync', 'durable'],
}

export const pagesDemo: Demo = {
  title: 'Pages two tabs edit at once',
  url: 'https://foldkit-pages-demo.pages.dev/',
  example: 'examples/pages',
  proves:
    'Rich text two people edit at the same time, online or not, converging through one journal.',
  tryThis: [
    {
      title: 'Share',
      text: 'Open the demo in two tabs, and make a page in one: it appears in the other.',
    },
    {
      title: 'Edit together',
      text: 'Type in the page from both tabs; each sees the other’s typing.',
    },
    { title: 'Reload', text: 'Reload a tab: the page is read back from the journal.' },
  ],
  readFirst: 'examples/pages/src/app.ts',
  packages: ['richtext', 'richtext-dom', 'richtext-markdown', 'sync', 'durable'],
}

export const todoDemo: Demo = {
  title: 'A todo list an agent can use',
  url: 'https://foldkit-todo-demo.pages.dev/',
  example: 'examples/todo-app',
  proves:
    'One application definition drives the view, the tools an agent calls, the document replicas share, and the policy the server enforces.',
  tryThis: [
    { title: 'Share', text: 'Add a todo, and open the demo in a second tab: it is there.' },
    {
      title: 'Someone else',
      text: 'Open it as Bob (add ?token=bob) and tick the todo: the first tab shows it ticked.',
    },
    { title: 'Reload', text: 'Reload a tab: what it shows is read back from the journal.' },
  ],
  readFirst: 'examples/todo-app/src/app.ts',
  packages: ['surface', 'sync', 'durable', 'agent', 'agent-webmcp', 'mixins', 'mirror'],
}

export const gridDemo: Demo = {
  title: 'A data grid over 100,000 rows',
  url: 'https://foldkit-grid-demo.pages.dev/',
  example: 'examples/data-grid',
  proves:
    'A grid that owns focus, selection, columns and the open editor, while the application owns every row.',
  tryThis: [
    {
      title: 'Edit',
      text: 'Pick a price and press Enter to edit it; one that is not a price, like 4.999, is refused.',
    },
    {
      title: 'Copy',
      text: 'Select a range with Shift and the arrow keys, and copy it into a spreadsheet.',
    },
    {
      title: 'Fill',
      text: 'Drag the square at the corner of a selected cell down to carry its value on. Ctrl+D fills a selected range from its first row.',
    },
    {
      title: 'Arrange',
      text: 'Open a column’s menu to pin or hide it, or drag its header to move it.',
    },
  ],
  readFirst: 'examples/data-grid/src/main.ts',
  packages: ['data-grid', 'mixins-data-grid', 'bundle'],
}

export const demos: ReadonlyArray<Demo> = [cmsDemo, registryDemo, pagesDemo, todoDemo, gridDemo]

/** Where the list of every demo is published. */
export const SITE_URL = 'https://foldkit-plus.pages.dev/'

/** A package's name as published, from its `packages/` directory. */
export const packageName = (directory: string): string => `foldkit-${directory}`

/** A repository path as a link on GitHub. */
export const onGitHub = (path: string): string =>
  `https://github.com/doeixd/foldkit-plus/blob/main/${path}`
