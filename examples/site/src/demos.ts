/**
 * Every published demo, written once: the site draws a card from each, and
 * the root README's list of demos is generated from them (`readme.ts`;
 * `test/demos.test.ts` keeps the two equal, and checks that every file a card
 * names exists).
 */

export interface Demo {
  readonly title: string
  /** Where it is published. */
  readonly url: string
  /** Its example, from the repository root. */
  readonly example: string
  /** One sentence: what the demo proves. */
  readonly proves: string
  /** Three things to try, in order. */
  readonly tryThis: readonly [string, string, string]
  /** The file to read first, from the repository root. */
  readonly readFirst: string
  /** The packages it shows, as `packages/` names them. */
  readonly packages: ReadonlyArray<string>
}

export const demos: ReadonlyArray<Demo> = [
  {
    title: 'A blog studio and its site',
    url: 'https://foldkit-cms-demo.pages.dev/',
    example: 'examples/cms',
    proves:
      'Drafts beside the row, revisions, scheduled publishing and a page builder, with the public site rendered at build time.',
    tryThis: [
      'As Wren, a writer, start a post. It saves as you type; a writer cannot publish.',
      'Switch to Edda, an editor, open it and publish it.',
      'View the site as a visitor: only what was published is there.',
    ],
    readFirst: 'examples/cms/src/server/server.ts',
    packages: ['cms', 'cms-drizzle', 'remote', 'crud', 'form', 'builder', 'ssr'],
  },
  {
    title: 'Two devices, one registry',
    url: 'https://foldkit-registry-demo.pages.dev/',
    example: 'examples/registry',
    proves:
      'Two devices edit 10,000 products in a data grid, offline and in conflict, and agree once both are back.',
    tryThis: [
      'Change a price in Device A. It shows in Device B a moment later.',
      'Tick “Work offline” in Device B, edit the same price in both, then untick it. The later edit wins, and the device that lost says so.',
      'Reload Device B while it is offline. Its edits are still waiting, and go when it is back.',
    ],
    readFirst: 'examples/registry/src/domain.ts',
    packages: ['data-grid', 'mixins-data-grid', 'remote', 'sync', 'durable'],
  },
  {
    title: 'Pages two tabs edit at once',
    url: 'https://foldkit-pages-demo.pages.dev/',
    example: 'examples/pages',
    proves:
      'Rich text two people edit at the same time, online or not, converging through one journal.',
    tryThis: [
      'Open the page in two tabs, and make a page in one: it appears in the other.',
      'Type in the page from both tabs; each sees the other’s typing.',
      'Reload a tab: the page is read back from the journal.',
    ],
    readFirst: 'examples/pages/src/app.ts',
    packages: ['richtext', 'richtext-dom', 'richtext-markdown', 'sync', 'durable'],
  },
  {
    title: 'A todo list an agent can use',
    url: 'https://foldkit-todo-demo.pages.dev/',
    example: 'examples/todo-app',
    proves:
      'One application definition drives the view, the tools an agent calls, the document replicas share, and the policy the server enforces.',
    tryThis: [
      'Add a todo, and open the page in a second tab: it is there.',
      'Open it as Bob (add ?token=bob) and tick the todo: the first tab shows it ticked.',
      'Reload a tab: what it shows is read back from the journal.',
    ],
    readFirst: 'examples/todo-app/src/app.ts',
    packages: ['surface', 'sync', 'durable', 'agent', 'agent-webmcp', 'mixins', 'mirror'],
  },
  {
    title: 'A data grid over 100,000 rows',
    url: 'https://foldkit-grid-demo.pages.dev/',
    example: 'examples/data-grid',
    proves:
      'A grid that owns focus, selection, columns and the open editor, while the application owns every row.',
    tryThis: [
      'Pick a price and press Enter to edit it; one that is not a price, like 4.999, is refused.',
      'Select a range with Shift and the arrow keys, and copy it into a spreadsheet.',
      'Open a column’s menu to pin or hide it, or drag its header to move it.',
    ],
    readFirst: 'examples/data-grid/src/main.ts',
    packages: ['data-grid', 'mixins-data-grid', 'bundle'],
  },
]

/** A package's name as published, from its `packages/` directory. */
export const packageName = (directory: string): string => `foldkit-${directory}`

/** A repository path as a link on GitHub. */
export const onGitHub = (path: string): string =>
  `https://github.com/doeixd/foldkit-plus/blob/main/${path}`
