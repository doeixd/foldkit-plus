/**
 * Primitive operators in SQL and the binding's two tables, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/operators.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/operators.test.ts']
const conformance = ['packages/remote-drizzle/test/conformance.test.ts']
const compile = '../src/compile.ts'
const index = '../src/index.ts'
const operators = '../src/operators.ts'

export default [
  {
    name: 'a numeric literal input is left untyped (#323)',
    edits: [
      {
        file: compile,
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
        file: compile,
        find: 'SchemaAST.isLiteral(ast) ? Number.isInteger(ast.literal) : SchemaShape.holdsIntegers(ast)',
        replace: 'SchemaShape.holdsIntegers(ast)',
      },
    ],
    tests,
  },
  {
    name: 'NaN given to an operator is bound (#296)',
    edits: [{ file: compile, find: 'if (isNaNValue(value)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a computed value of NaN is bound (#296)',
    edits: [
      {
        file: compile,
        find: 'if (isNaNValue(value)) throw new QueryCompileError(`${query} computes from NaN',
        replace: 'if (false) throw new QueryCompileError(`${query} computes from NaN',
      },
    ],
    tests,
  },
  {
    name: 'SQLite casts its parameters too',
    edits: [
      {
        file: compile,
        find: "dialectOf(target) === 'sqlite'\n    ? sql`${bindable(value, target)}`",
        replace: 'false\n    ? sql`${bindable(value, target)}`',
      },
    ],
    tests,
  },
  {
    name: 'every number is cast as a real number',
    edits: [
      {
        file: compile,
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
        file: compile,
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
        file: compile,
        find: 'return sql`${value}`\n  if (holdsNul(value)) {',
        replace: 'return sql`${value}`\n  if (false) {',
      },
    ],
    tests,
  },
  {
    name: "a call's binary text is compared uncollated on Postgres",
    edits: [
      {
        file: compile,
        find: 'dialect === \'postgres\' ? sql`(${text} collate "C")` : sql`(${text} collate binary)`,',
        replace: "dialect === 'postgres' ? text : sql`(${text} collate binary)`,",
      },
    ],
    tests,
  },
  {
    name: "a call's folded text is compared unfolded on SQLite",
    edits: [{ file: compile, find: ': sql`(${text} collate nocase)`,', replace: ': text,' }],
    tests,
  },
  {
    name: "a comparison with a call ignores the call's collation",
    edits: [
      {
        file: compile,
        find: 'if (!is(left, Column) || (isColumn(second) && !is(right, Column))) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'an implementation is given no collation to apply',
    edits: [
      {
        file: compile,
        find: 'collate: collateFor(call.collation, dialect),',
        replace: 'collate: collateFor(Option.none(), dialect),',
      },
    ],
    tests: conformance,
  },
  {
    name: 'startsWith compares its prefix uncollated on Postgres',
    edits: [
      {
        file: operators,
        find: '? sql`${collate(sql`left(${text}, length(${prefix}))`)} = ${collate(prefix!)}`',
        replace: '? sql`${collate(sql`left(${text}, length(${prefix}))`)} = ${prefix}`',
      },
    ],
    tests: conformance,
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
        find: 'DomainEntity.judgeAgainst(invariants, change, binding.operators.memory)',
        replace: 'DomainEntity.judgeAgainst(invariants, change)',
      },
    ],
    tests,
  },
  {
    name: "an insert's row is judged without the table",
    edits: [
      {
        file: index,
        find: '            { after: { ...values, id } },\n            binding.operators.memory,\n',
        replace: '            { after: { ...values, id } },\n',
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
