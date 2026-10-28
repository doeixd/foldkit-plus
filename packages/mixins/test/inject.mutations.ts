/**
 * Style injection, broken:
 * `pnpm mutate packages/mixins/test/inject.mutations.ts`.
 */
export default [
  {
    name: 'the injected sheet repeats no layer order where the page has one',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'element.textContent = into.order ?? layerOrder()',
        replace: "element.textContent = into.order === undefined ? layerOrder() : ''",
      },
    ],
    tests: ['packages/mixins/test/inject.test.ts'],
  },
  {
    name: 'a server writes no global rule a found class needs',
    edits: [{ file: '../src/inject.ts', find: '...[...globals].map(withoutOrder),', replace: '' }],
    tests: ['packages/mixins/test/inject.test.ts'],
  },
  {
    name: 'a server writes a global once per class that needs it',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'const globals = new Set([...found.values()].flatMap(entry => [...entry.globals]))',
        replace: 'const globals = [...found.values()].flatMap(entry => [...entry.globals])',
      },
    ],
    tests: ['packages/mixins/test/inject.test.ts'],
  },
  {
    name: 'a server repeats the layer order of a Style it writes the globals of',
    edits: [
      {
        file: '../src/inject.ts',
        find: '...[...globals].map(withoutOrder),',
        replace: '...globals,',
      },
    ],
    tests: ['packages/mixins/test/inject.test.ts'],
  },
  {
    name: 'a compiled class carries none of its Style’s globals',
    edits: [
      {
        file: '../src/style.ts',
        find: 'register(generated, css, globalCss)',
        replace: "register(generated, css, '')",
      },
    ],
    tests: ['packages/mixins/test/inject.test.ts'],
  },
  {
    name: 'a conditional class carries none of its Style’s globals',
    edits: [
      {
        file: '../src/style.ts',
        find: 'piece: compileTree(condition.piece, globalCss, collected),',
        replace: "piece: compileTree(condition.piece, '', collected),",
      },
    ],
    tests: ['packages/mixins/test/inject.test.ts'],
  },
  {
    name: 'the browser injects a global the server already wrote',
    edits: [
      {
        file: '../src/inject.ts',
        find: 'if (!into.text.includes(css)) pending.push(css)',
        replace: 'pending.push(css)',
      },
    ],
    tests: ['packages/mixins/test/inject.test.ts'],
  },
]
