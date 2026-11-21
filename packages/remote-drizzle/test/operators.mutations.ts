/**
 * Primitive operators in SQL and the binding's two tables, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/operators.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/operators.test.ts']
const conformance = ['packages/remote-drizzle/test/conformance.test.ts']
const compile = '../src/compile.ts'
const lowering = '../src/lowering.ts'
const sqlLowering = '../../metakit/src/sqlLowering.ts'
const index = '../src/index.ts'
const operators = '../src/operators.ts'

const render = '../src/render.ts'

export default [
  {
    name: 'a numeric literal input is left untyped (#323)',
    edits: [
      {
        file: render,
        find: "SchemaAST.isNumber(ast) || (SchemaAST.isLiteral(ast) && typeof ast.literal === 'number')",
        replace: 'SchemaAST.isNumber(ast)',
      },
    ],
    tests,
  },
  {
    name: 'an integer literal input is cast as a real number (#323)',
    edits: [
      {
        file: render,
        find: 'SchemaAST.isLiteral(ast) ? Number.isInteger(ast.literal) : SchemaShape.holdsIntegers(ast)',
        replace: 'SchemaShape.holdsIntegers(ast)',
      },
    ],
    tests,
  },
  {
    name: 'NaN given to an operator or a computation is bound (#296)',
    edits: [
      {
        file: sqlLowering,
        find: "if (typeof value === 'number' && !Number.isFinite(value)) {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'SQLite casts its parameters too',
    edits: [
      {
        file: render,
        find: "if (dialectOf(frame.target) === 'sqlite' || schema === undefined)",
        replace: 'if (schema === undefined)',
      },
    ],
    tests,
  },
  {
    name: 'every number is cast as a real number',
    edits: [
      {
        file: render,
        find: "if (!present.every(holdsIntegers)) return Option.some(sql.raw('double precision'))",
        replace: "return Option.some(sql.raw('double precision'))",
      },
    ],
    tests,
  },
  {
    name: 'a boolean is not cast',
    edits: [
      {
        file: render,
        find: 'present.length > 0 && present.every(SchemaAST.isBoolean)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'text holding NUL reaches an operator',
    edits: [
      {
        file: sqlLowering,
        find: "if (typeof value === 'string' && value.includes('\\u0000')) {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: "a call's binary text is compared uncollated on Postgres",
    edits: [
      {
        file: sqlLowering,
        find: '? q`(${left} ${operator} ${right} COLLATE "C")`',
        replace: '? q`(${left} ${operator} ${right})`',
      },
    ],
    tests,
  },
  {
    name: "a call's folded text is compared unfolded on SQLite",
    edits: [
      {
        file: sqlLowering,
        find: '(ctx.dialect === \'postgres\' ? q`lower(${s} COLLATE "C")` : q`lower(${s})`)',
        replace: '(ctx.dialect === \'postgres\' ? q`lower(${s} COLLATE "C")` : s)',
      },
    ],
    tests,
  },
  {
    name: 'an operator over a column is run in memory, past the SQL its table writes',
    edits: [
      {
        file: lowering,
        find: 'readsStored(node) ? {} : foreignOf(',
        replace: 'false ? {} : foreignOf(',
      },
    ],
    tests,
  },
  {
    name: 'an SQL implementation of a kernel operator is taken',
    edits: [
      {
        file: operators,
        find: 'if (isKernelOperator(operator.descriptor)) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/remote-drizzle/test/operatorConformance.test.ts'],
  },
  {
    name: 'a query is registered without its operators checked',
    edits: [
      {
        file: compile,
        find: 'requireOperators([...body.where, ...body.orderBy], target, `query "${query}"`, bodyOperations)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'only the memory table is checked',
    edits: [{ file: compile, find: 'if (inSql.length > 0)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'only the SQL table is checked',
    edits: [
      {
        file: compile,
        find: 'const inMemory = Expr.unsupported(nodes, { operations, operators: tables.memory })',
        replace: 'const inMemory: ReadonlyArray<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'a writer is built over an invariant its binding cannot run',
    edits: [
      {
        file: index,
        find: "requireOperators([held.predicate], binding, invariantName(held), [...writeOperations, 'next'])",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "a write's precondition is served without its operators checked",
    edits: [
      {
        file: index,
        find: "onSome: body => operatorProblems(body.where, binding, 'its precondition', writeOperations),",
        replace: 'onSome: () => [],',
      },
    ],
    tests,
  },
  {
    name: "an update's invariants are compiled without the binding's operators",
    edits: [{ file: index, find: '        operators: binding.operators,\n', replace: '' }],
    tests,
  },
  {
    name: "a missed update's precondition is evaluated without the table",
    edits: [
      {
        file: index,
        find: 'evaluate(body, input, [row], { operators: binding.operators.memory })',
        replace: 'evaluate(body, input, [row])',
      },
    ],
    tests,
  },
  {
    name: "a missed update's row is judged without the table",
    edits: [
      {
        file: index,
        find: 'DomainEntity.judgeAgainst(judged, change, binding.operators.memory)',
        replace: 'DomainEntity.judgeAgainst(judged, change)',
      },
    ],
    tests,
  },
  {
    name: "an insert's row is judged without the table",
    edits: [
      {
        file: index,
        find: '            { after: { ...values, ...linkIds(links), id } },\n            binding.operators.memory,\n',
        replace: '            { after: { ...values, ...linkIds(links), id } },\n',
      },
    ],
    tests,
  },
  {
    name: 'entity drops the operators it is given',
    edits: [
      {
        file: '../src/binding.ts',
        find: 'operators: operatorsFrom(options?.operators),',
        replace: 'operators: operatorsFrom(undefined),',
      },
    ],
    tests,
  },
  {
    name: 'bind drops the operators it is given',
    edits: [
      {
        file: '../src/bind.ts',
        find: 'const operators = operatorsFrom(options.operators)',
        replace: 'const operators = operatorsFrom(undefined)',
      },
    ],
    tests,
  },
  {
    name: 'a given memory table is replaced by the kernel',
    edits: [
      {
        file: operators,
        find: 'memory: given?.memory ?? Operators.kernel,',
        replace: 'memory: Operators.kernel,',
      },
    ],
    tests,
  },
  {
    name: 'an operator implemented twice is kept',
    edits: [
      {
        file: operators,
        find: 'fail(`${nameOf(operator)} is implemented twice; replace one with DrizzleOperators.override`)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'two operators under one name are kept',
    edits: [
      {
        file: operators,
        find: 'fail(`two operators are named ${nameOf(operator)}; give one another id or version`)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a merge implementing one operator twice is kept',
    edits: [{ file: operators, find: 'if (both.length > 0) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'an override keeps the implementation it replaces',
    edits: [
      {
        file: operators,
        find: '...base.implementations.filter(({ operator }) => !replaced.has(operator)),',
        replace: '...base.implementations,',
      },
    ],
    tests,
  },
  {
    name: 'GuardDrizzle.visible checks its Read rules by the kernel alone',
    edits: [
      {
        file: '../../guard/src/drizzle.ts',
        find: 'const sqlOperators = options.operators ?? DrizzleOperators.kernel',
        replace: 'const sqlOperators = DrizzleOperators.kernel',
      },
    ],
    tests: ['packages/guard/test/drizzle.test.ts'],
  },
]
