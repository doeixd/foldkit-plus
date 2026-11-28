/**
 * `metakit/syntax` guards broken in turn:
 * `pnpm mutate packages/metakit/test/syntax.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/metakit/test/syntax.test.ts']

export default [
  {
    name: 'dual ignores self position and always prepends receiver at 0',
    edits: [
      {
        file: '../src/syntax.ts',
        find: `        const full = [...args.slice(0, selfPos), self, ...args.slice(selfPos)]`,
        replace: `        const full = [self, ...args]`,
      },
    ],
    tests,
  },
  {
    name: 'dualLanguage allows reserved JS property names',
    edits: [
      {
        file: '../src/syntax.ts',
        find: `      if (RESERVED_PROPS.has(opName)) {
        throw new Error(`,
        replace: `      if (false && RESERVED_PROPS.has(opName)) {
        throw new Error(`,
      },
    ],
    tests,
  },
  {
    name: 'grammar.validate ignores requiredTerminal check',
    edits: [
      {
        file: '../src/syntax.ts',
        find: `        if (requiredTerminal !== undefined && !requiredTerminal.includes(current)) {`,
        replace: `        if (false && requiredTerminal !== undefined && !requiredTerminal.includes(current)) {`,
      },
    ],
    tests,
  },
  {
    name: 'grammar.validate allows illegal transitions',
    edits: [
      {
        file: '../src/syntax.ts',
        find: `          if (allowed === undefined || !Object.hasOwn(allowed, transition)) {
            return Effect.fail(`,
        replace: `          if (false && (allowed === undefined || !Object.hasOwn(allowed, transition))) {
            return Effect.fail(`,
      },
    ],
    tests,
  },
]
