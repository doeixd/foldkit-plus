/**
 * Attribute tokens, broken in turn: `pnpm mutate packages/mixins/test/attrTokens.mutations.ts`.
 */
const tests = ['packages/mixins/test/attrTokens.test.ts']

const spelled = (name: string, wrong: string) => ({
  name: `${name} names another attribute`,
  edits: [{ file: '../src/attr.ts', find: `make('${name}')`, replace: `make('${wrong}')` }],
  tests,
})

export default [
  spelled('aria-checked', 'aria-check'),
  spelled('aria-labelledby', 'aria-labeledby'),
  spelled('aria-controls', 'aria-control'),
  spelled('aria-readonly', 'aria-readonlyy'),
  spelled('aria-required', 'aria-require'),
  spelled('aria-current', 'aria-curent'),
  spelled('aria-valuenow', 'aria-value'),
]
