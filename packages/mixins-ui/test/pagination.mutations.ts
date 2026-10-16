/**
 * Pagination, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/pagination.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/pagination.test.ts']

export default [
  {
    name: 'every stop draws, however many',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'if (count <= 2 * boundaries + 2 * siblings + 3) {',
        replace: 'if (count <= 2 * boundaries + 2 * siblings) {',
      },
    ],
    tests,
  },
  {
    name: 'the current stop reads as any other',
    edits: [
      {
        file: '../src/pagination.ts',
        find: "...(item === current ? [h.AriaCurrent('page')] : []),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a lone page paginates',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'if (Math.floor(options.pageCount) < 2) return h.empty',
        replace: 'if (Math.floor(options.pageCount) < 1) return h.empty',
      },
    ],
    tests,
  },
  {
    name: 'choosing a stop stays put',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'h.OnClick(options.onPage(item)),',
        replace: 'h.OnClick(options.onPage(current)),',
      },
    ],
    tests,
  },
  {
    name: 'an ellipsis hides a single page',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'if (stop - previous === 2) items.push(stop - 1)',
        replace: "if (stop - previous === 2) items.push('ellipsis')",
      },
    ],
    tests,
  },
  {
    name: 'siblings are ignored',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'const siblings = Math.max(0, Math.floor(window.siblings ?? 1))',
        replace: 'const siblings = 1',
      },
    ],
    tests,
  },
  {
    name: 'boundaries are ignored',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'const boundaries = Math.max(1, Math.floor(window.boundaries ?? 1))',
        replace: 'const boundaries = 1',
      },
    ],
    tests,
  },
  {
    name: 'the view drops the window',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'itemsOf(current, count, options)',
        replace: 'itemsOf(current, count)',
      },
    ],
    tests,
  },
  {
    name: 'simple still numbers the stops',
    edits: [
      {
        file: '../src/pagination.ts',
        find: '...(options.numbered === false',
        replace: '...(options.numbered === true',
      },
    ],
    tests,
  },
  {
    name: 'last goes to the first page',
    edits: [
      {
        file: '../src/pagination.ts',
        find: "stop(count, 'last', 'Last', current === count)",
        replace: "stop(1, 'last', 'Last', current === count)",
      },
    ],
    tests,
  },
  {
    name: 'the summary runs past the last row',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'const to = Math.min(total, page * perPage)',
        replace: 'const to = page * perPage',
      },
    ],
    tests,
  },
  {
    name: 'the summary counts from 0',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'const from = Math.min(total, (page - 1) * perPage + 1)',
        replace: 'const from = Math.min(total, (page - 1) * perPage)',
      },
    ],
    tests,
  },
  {
    name: 'compact hides the current stop too',
    edits: [
      {
        file: '../src/recipes/pagination.ts',
        find: 'page: variant(Style.at(narrow, Style.pseudo(\':not([aria-current="page"])\', hidden))),',
        replace: 'page: variant(Style.at(narrow, Style.self(hidden))),',
      },
    ],
    tests: ['packages/mixins-ui/test/pagination.browser.test.ts'],
  },
  {
    name: 'compact is off unless asked',
    edits: [
      {
        file: '../src/recipes/pagination.ts',
        find: "defaults: { compact: 'narrow' },",
        replace: "defaults: { compact: 'never' },",
      },
    ],
    tests: ['packages/mixins-ui/test/pagination.browser.test.ts'],
  },
  {
    name: 'compact hides the total with the other numbers',
    edits: [
      {
        file: '../src/recipes/pagination.ts',
        find: 'pageCount: variant(Style.at(narrow, Style.self(shown))),',
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/pagination.browser.test.ts'],
  },
  {
    name: 'the total shows beside every number',
    edits: [
      {
        file: '../src/recipes/pagination.ts',
        find: 'Style.self({ ...hidden, color: ref.text.muted, fontWeight: ref.weight.normal }),',
        replace: 'Style.self({ color: ref.text.muted, fontWeight: ref.weight.normal }),',
      },
    ],
    tests: ['packages/mixins-ui/test/pagination.browser.test.ts'],
  },
  {
    name: 'the select shows a size other than the one in use',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'h.Selected(size === range.perPage)',
        replace: 'h.Selected(size !== range.perPage)',
      },
    ],
    tests: ['packages/mixins-ui/test/pagination.browser.test.ts'],
  },
  {
    name: 'the select sends the first size whatever is chosen',
    edits: [
      {
        file: '../src/pagination.ts',
        find: 'choose.onPerPage(Number(value))',
        replace: 'choose.onPerPage(choose.sizes[0] ?? Number(value))',
      },
    ],
    tests: ['packages/mixins-ui/test/pagination.browser.test.ts'],
  },
]
