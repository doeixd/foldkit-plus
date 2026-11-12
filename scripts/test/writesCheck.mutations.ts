/**
 * The check for Model writes outside a Message:
 * `pnpm mutate scripts/test/writesCheck.mutations.ts`.
 */
const file = '../writes-check.mjs'
const tests = ['scripts/test/writesCheck.test.ts']

export default [
  {
    name: 'a Focus member is not told from another interface by its owner file',
    edits: [
      {
        file,
        find: 'if (!owner.getSourceFile().fileName.endsWith(seamFile)) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a write is not told from a read by its member name',
    edits: [
      {
        file,
        find: 'if (!memberNames.has(node.text)) return undefined',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a call through brackets is not read',
    edits: [
      {
        file,
        find: 'ts.isElementAccessExpression(node) &&',
        replace: 'false &&',
      },
    ],
    tests,
  },
  {
    name: 'a destructured write is not read',
    edits: [
      {
        file,
        find: 'ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a marker is not required to give a reason',
    edits: [
      {
        file,
        find: 'if (line !== undefined && reason.test(line)) return',
        replace: 'if (line !== undefined) return',
      },
    ],
    tests,
  },
  {
    name: 'a marker is not read',
    edits: [{ file, find: 'if (line !== undefined && reason.test(line)) return', replace: '' }],
    tests,
  },
  {
    name: 'a marker is read from the call line only, not above',
    edits: [
      {
        file,
        find: '[lines[at], lines[at - 1]].find(',
        replace: '[lines[at]].find(',
      },
    ],
    tests,
  },
  {
    name: 'a marker over a statement spanning lines is not read from its first line',
    edits: [
      {
        file,
        find: 'return near(lineOf(node)) ?? near(lineOf(statement))',
        replace: 'return near(lineOf(node))',
      },
    ],
    tests,
  },
  {
    name: 'an allowed module is read anyway',
    edits: [{ file, find: 'if (allowed.includes(relativeFile)) continue', replace: '' }],
    tests,
  },
  {
    name: 'a property access is not read',
    edits: [
      { file, find: 'const seam = seamOf(checker, node.name)', replace: 'const seam = undefined' },
    ],
    tests,
  },
  {
    name: 'a project is kept only when it references surface directly',
    edits: [
      {
        file,
        find: 'return [...references(from)].some(walk)',
        replace: 'return [...references(from)].some(next => next === target)',
      },
    ],
    tests,
  },
  {
    name: 'a project that does not reach surface is kept',
    edits: [{ file, find: 'return walk(resolve(dir))', replace: 'return true' }],
    tests,
  },
  {
    name: 'surface itself is not kept',
    edits: [{ file, find: 'if (from === target) return true', replace: '' }],
    tests,
  },
]
