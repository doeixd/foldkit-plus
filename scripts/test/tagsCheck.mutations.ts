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
        find: 'const what = comparesHeld(node.condition)',
        replace: 'const what = false',
      },
    ],
    tests,
  },
  {
    name: 'an if/else on a held tag is allowed',
    edits: [
      {
        file,
        find: '.find(expression => comparesHeld(expression) || comparesDirect(expression))',
        replace: '.find(expression => comparesDirect(expression))',
      },
    ],
    tests,
  },
  {
    name: 'an else-if chain is reported at every link',
    edits: [
      {
        file,
        find: '!(ts.isIfStatement(node.parent) && node.parent.elseStatement === node)',
        replace: 'true',
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
  {
    name: 'a ternary on a direct tag is allowed',
    edits: [{ file, find: ': comparesDirect(node.condition)', replace: ': false' }],
    tests,
  },
  {
    name: 'an if/else on a direct tag is allowed',
    edits: [
      {
        file,
        find: '.find(expression => comparesHeld(expression) || comparesDirect(expression))',
        replace: '.find(expression => comparesHeld(expression))',
      },
    ],
    tests,
  },
  {
    name: 'a direct tag inside && or || is not read',
    edits: [
      {
        file,
        find: 'return comparesDirect(inner.left) || comparesDirect(inner.right)',
        replace: 'return false',
      },
    ],
    tests,
  },
  {
    name: 'a direct tag with the literal on the left is not read',
    edits: [
      {
        file,
        find: '(isTagAccess(unwrap(inner.right)) && literal(inner.left))',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a direct comparison of a tag with anything is a branch',
    edits: [
      {
        file,
        find: 'ts.isStringLiteralLike(unwrap(side)) || checker.getTypeAtLocation(side).isStringLiteral()',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a later condition of an else-if chain is not read',
    edits: [
      {
        file,
        find: '.map(branch => branch.expression)',
        replace: '.slice(0, 1).map(branch => branch.expression)',
      },
    ],
    tests,
  },
  {
    name: 'an if followed by a return is not a pair',
    edits: [
      {
        file,
        find: 'endsInReturn(statement.thenStatement) &&',
        replace: 'false &&',
      },
    ],
    tests,
  },
  {
    name: 'a block that ends in a return is not a then-branch that returns',
    edits: [
      {
        file,
        find: 'statement.statements.length > 0 &&',
        replace: 'false &&',
      },
    ],
    tests,
  },
  {
    name: 'a guard mixing a tag with another check is a pair',
    edits: [
      {
        file,
        find: 'onlyTags(statement.expression)',
        replace: '(comparesHeld(statement.expression) || comparesDirect(statement.expression))',
      },
    ],
    tests,
  },
  {
    name: 'a pair that is also sibling ifs is reported twice',
    edits: [
      {
        file,
        find: '!inRun.has(statement) &&',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a negated tag comparison is not unwrapped',
    edits: [
      {
        file,
        find: 'inner.operator === ts.SyntaxKind.ExclamationToken',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a loose == is not a comparison',
    edits: [
      {
        file,
        find: 'kind === ts.SyntaxKind.EqualsEqualsToken ||\n  kind === ts.SyntaxKind.ExclamationEqualsToken',
        replace: 'kind === ts.SyntaxKind.ExclamationEqualsToken',
      },
    ],
    tests,
  },
  {
    name: 'a loose != is not a comparison',
    edits: [
      {
        file,
        find: '||\n  kind === ts.SyntaxKind.ExclamationEqualsToken\nconst isPositiveEquality',
        replace: '\nconst isPositiveEquality',
      },
    ],
    tests,
  },
  {
    name: 'an element access of _tag is not a tag',
    edits: [
      {
        file,
        find: '(ts.isElementAccessExpression(node) &&',
        replace: '(false &&',
      },
    ],
    tests,
  },
  {
    name: 'a constant of a literal type is not a literal',
    edits: [
      {
        file,
        find: '|| checker.getTypeAtLocation(side).isStringLiteral()',
        replace: '|| false',
      },
    ],
    tests,
  },
]
