/**
 * The check for a tag held in a variable:
 * `pnpm mutate scripts/test/tagsCheck.mutations.ts`.
 */
const file = '../tags-check.mjs'
const tests = ['scripts/test/tagsCheck.test.ts']

export default [
  {
    name: 'a variable initialised from a tag is not followed',
    edits: [
      {
        file,
        find: 'if (ts.isIdentifier(inner)) return variables.has(symbolOf(inner))',
        replace: 'if (ts.isIdentifier(inner)) return false',
      },
    ],
    tests,
  },
  {
    name: 'a call of a function returning a tag is not followed',
    edits: [
      {
        file,
        find: 'return ts.isIdentifier(callee) && functions.has(symbolOf(callee))',
        replace: 'return false',
      },
    ],
    tests,
  },
  {
    name: 'a tag passed as an argument does not reach the parameter',
    edits: [
      {
        file,
        find: 'if (parameter && ts.isIdentifier(parameter.name) && derived(argument))',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'a tag passed to a call makes its caller return one',
    edits: [{ file, find: '!derived(argument) && yields(argument)', replace: 'yields(argument)' }],
    tests,
  },
  {
    name: 'a function handed to a call does not make its caller return a tag',
    edits: [
      {
        file,
        find: '!derived(argument) && yields(argument)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a function declaration is not a function returning a tag',
    edits: [
      {
        file,
        find: 'if (ts.isFunctionDeclaration(node) && node.name && returnsTag(node))',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'a return statement does not return a tag',
    edits: [{ file, find: 'found = true', replace: 'found = false' }],
    tests,
  },
  {
    name: 'a ternary does not hand on its branches tags',
    edits: [
      {
        file,
        find: 'derived(inner.whenTrue) || derived(inner.whenFalse)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a held tag compared is never refused',
    edits: [{ file, find: 'if (!literalTags(type))', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'a held tag of literals compared once is refused',
    edits: [{ file, find: 'if (!literalTags(type))', replace: 'if (true)' }],
    tests,
  },
  {
    name: 'a held tag on the right of a comparison is read',
    edits: [
      {
        file,
        find: 'const side = held(node.left) ? node.left : held(node.right) ? node.right : undefined',
        replace: 'const side = held(node.left) ? node.left : undefined',
      },
    ],
    tests,
  },
  {
    name: 'a ternary on a held tag is allowed',
    edits: [
      {
        file,
        find: 'if (ts.isConditionalExpression(node) && comparesHeld(node.condition))',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'an if/else on a held tag is allowed',
    edits: [{ file, find: 'comparesHeld(node.expression)', replace: 'false' }],
    tests,
  },
  {
    name: 'an else-if chain is reported at every link',
    edits: [
      {
        file,
        find: '!(ts.isIfStatement(node.parent) && node.parent.elseStatement === node) &&',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a switch on a held tag is allowed',
    edits: [{ file, find: ' || held(node.expression)', replace: '' }],
    tests,
  },
  {
    name: 'sibling ifs on a held tag are allowed',
    edits: [{ file, find: 'held(expression.left) &&', replace: 'false &&' }],
    tests,
  },
  {
    name: 'a mark covers only its own line',
    edits: [
      {
        file,
        find: 'return markedAt(node) || markedAt(statement)',
        replace: 'return markedAt(node)',
      },
    ],
    tests,
  },
  {
    name: 'a _tag holding an object is a tag',
    edits: [
      {
        file,
        find: 'return tagLike(checker.getTypeAtLocation(inner))',
        replace: 'return true',
      },
    ],
    tests,
  },
]
