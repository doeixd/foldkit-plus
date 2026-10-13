/**
 * The site, its content pipeline and its card data, broken in turn: `pnpm
 * mutate examples/site/test/site.mutations.ts` checks that a test fails for
 * every one.
 */
const tests = [
  'examples/site/test/demos.test.ts',
  'examples/site/test/guides.test.ts',
  'examples/site/test/prerender.test.ts',
  'examples/site/test/copy.test.ts',
  'examples/site/test/links.test.ts',
]
export default [
  {
    name: 'a card the README does not list',
    edits: [
      {
        file: '../src/demos.ts',
        find: 'converging through one journal.',
        replace: 'converging.',
      },
    ],
    tests,
  },
  {
    name: 'a card that names a file that is not there',
    edits: [
      {
        file: '../src/demos.ts',
        find: "readFirst: 'examples/pages/src/app.ts'",
        replace: "readFirst: 'examples/pages/src/model.ts'",
      },
    ],
    tests,
  },
  {
    name: 'a row that does not link its packages',
    edits: [
      {
        file: '../src/view/home.ts',
        find: '...demo.packages.flatMap((name, index) => [',
        replace: '...[].flatMap((name: string, index: number) => [',
      },
    ],
    tests,
  },
  {
    name: 'a row whose source is not its file',
    edits: [
      {
        file: '../src/view/home.ts',
        find: 'h.Href(onGitHub(demo.readFirst))',
        replace: 'h.Href(onGitHub(demo.example))',
      },
    ],
    tests,
  },
  {
    name: 'every example shown at once',
    edits: [
      {
        file: '../src/view/home.ts',
        find: '...(model.example === example ? [] : [h.Hidden(true)]),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a short section on a page of its own',
    edits: [
      {
        file: '../src/content/guides.ts',
        find: 'const SHORT_SECTION = 700',
        replace: 'const SHORT_SECTION = 0',
      },
    ],
    tests,
  },
  {
    name: "a link to a page's own title keeps an anchor nothing carries",
    edits: [
      {
        file: '../src/content/guides.ts',
        find: 'heading === section.heading ? section.path : `${section.path}#${id}`',
        replace: '`${section.path}#${id}`',
      },
    ],
    tests,
  },
  {
    name: 'a folder linked as a file',
    edits: [
      {
        file: '../src/content/guides.ts',
        find: "isDirectory() ? 'tree' : 'blob'",
        replace: "isDirectory() ? 'blob' : 'blob'",
      },
    ],
    tests,
  },
  {
    name: 'a sidebar that does not mark the page',
    edits: [
      {
        file: '../src/content/library.ts',
        find: "if (page === current) return [ih.AriaCurrent('page')]",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'code drawn without colour',
    edits: [
      {
        file: '../src/content/highlight.ts',
        find: '?.(code) ?? []',
        replace: '&& []',
      },
    ],
    tests,
  },
  {
    name: "every export in the sidebar, beside its entry point's page",
    edits: [
      {
        file: '../src/content/library.ts',
        find: 'page.kind === kind && page.listed',
        replace: 'page.kind === kind',
      },
    ],
    tests,
  },
  {
    name: "an export's page that marks no entry point",
    edits: [
      {
        file: '../src/content/library.ts',
        find: "page.path === current.module ? [ih.AriaCurrent('location')] : []",
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: "a namespace's members left out of its page",
    edits: [
      {
        file: '../src/content/api.ts',
        find: "member(ih, drawing, entry.name, each, ids[index] ?? ''),",
        replace: 'ih.span([], [String(index)]),',
      },
    ],
    tests,
  },
  {
    name: 'a click credited to the button after it',
    edits: [{ file: '../src/main.ts', find: '.indexOf(button)', replace: '.indexOf(button) + 1' }],
    tests,
  },
  {
    name: 'a copy that marks no button done',
    edits: [{ file: '../src/main.ts', find: "button.textContent = 'Copied'", replace: '' }],
    tests,
  },
  {
    name: 'a fence drawn without its copy button',
    edits: [
      { file: '../src/content/render.ts', find: '...(copy ? { copy: {} } : {}),', replace: '' },
    ],
    tests,
  },
  {
    name: 'a plain word linked to another family',
    edits: [
      { file: '../src/content/links.ts', find: '/^[A-Z][a-z]+$/.test(name)', replace: 'false' },
    ],
    tests,
  },
  {
    name: 'a re-export as good as the declaration',
    edits: [
      {
        file: '../src/content/links.ts',
        find: 'declared.length > 0 ? declared : found',
        replace: 'found',
      },
    ],
    tests,
  },
  {
    name: 'a page that links to itself',
    edits: [
      {
        file: '../src/content/links.ts',
        find: "Option.filter(path => path.split('#')[0] !== from),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an export that does not list the guides naming it',
    edits: [
      {
        file: '../src/content/library.ts',
        find: 'mentionsOf: path => mentions.get(path) ?? [],',
        replace: 'mentionsOf: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'a shared export documented under the first entry point to list it',
    edits: [
      {
        file: '../src/content/api.ts',
        find: 'nearness(module, entry) > nearness(held.module, entry)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: "the primitives' subpath guides left off the site",
    edits: [{ file: '../src/catalog.ts', find: "        ['time', 'Time'],\n", replace: '' }],
    tests,
  },
  {
    name: "a Bundle's page draws only its full type",
    edits: [{ file: '../src/content/api.ts', find: 'bundleTable(ih, bundle),', replace: '' }],
    tests,
  },
  {
    name: 'a README without markers is written anyway',
    edits: [{ file: '../src/readme.ts', find: '  listIn(readme)\n', replace: '' }],
    tests,
  },
]
