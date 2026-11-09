/**
 * The CHECKs an Entity's rules compile to, and `bind`'s refusal of a table that
 * says otherwise, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/checks.mutations.ts`.
 */
const checks = '../src/checks.ts'
const bind = '../src/bind.ts'
const tests = ['packages/remote-drizzle/test/checks.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an empty text starts with any prefix on SQLite',
    checks,
    "coalesce(substr(${blob}, 1, ${number(bytes.length)}), X'')",
    'substr(${blob}, 1, ${number(bytes.length)})',
  ),
  edit(
    'an empty text ends with any suffix on SQLite',
    checks,
    "coalesce(substr(${blob}, ${number(-bytes.length)}), X'')",
    'substr(${blob}, ${number(-bytes.length)})',
  ),
  edit(
    'a contained needle is matched only at the start on SQLite',
    checks,
    'sql`instr(${blob}, ${hex}) > 0`',
    'sql`instr(${blob}, ${hex}) = 1`',
  ),
  edit(
    'a contained needle is matched only at the start on Postgres',
    checks,
    'sql`strpos(${column} collate "C", ${text}) > 0`',
    'sql`strpos(${column} collate "C", ${text}) = 1`',
  ),
  edit(
    'a suffix is matched at the start on Postgres',
    checks,
    '? sql`right(${column}',
    '? sql`left(${column}',
  ),
  edit(
    'a needle with half a pair compiles',
    checks,
    'Option.filter(wellFormed),',
    'Option.filter(() => true),',
  ),
  edit(
    'a needle holding a NUL compiles on Postgres',
    checks,
    "dialect === 'sqlite' || !needle",
    'true || !needle',
  ),
  edit(
    'an integer takes a fraction on SQLite',
    checks,
    '${column} = cast(${column} as integer)',
    '${column} = ${column}',
  ),
  edit(
    'an integer takes a fraction on Postgres',
    checks,
    '${column} = trunc(${column})',
    '${column} = ${column}',
  ),
  edit(
    'an integer past 2^53 passes on SQLite',
    checks,
    '(abs(${column}) <= ${number(Number.MAX_SAFE_INTEGER)} and ${column} = cast(',
    '(${column} = cast(',
  ),
  edit(
    'an integer past 2^53 passes on Postgres',
    checks,
    '(abs(${column}) <= ${number(Number.MAX_SAFE_INTEGER)} and ${column} = trunc(',
    '(${column} = trunc(',
  ),
  edit(
    'a length in UTF-16 units compiles with no pattern beside it',
    checks,
    'const overAscii = (_: number, ascii: boolean) => ascii',
    'const overAscii = (_: number, ascii: boolean) => ascii || true',
  ),
  edit(
    'a non-empty rule is left to the server',
    checks,
    '(n, ascii) => ascii || n <= 1',
    '(n, ascii) => ascii || n <= 0',
  ),
  edit(
    'a pattern drops its length',
    checks,
    '  ...atLeast(plainLength, column, held.minimum),\n',
    '',
  ),
  edit('a NUL ends what GLOB reads', checks, '        sql`instr(${column}, char(0)) = 0`,\n', ''),
  edit(
    "SQLite's length stops at a NUL",
    checks,
    "const count = dialect === 'sqlite' && !ascii ? nulSafeLength : plainLength",
    'const count = plainLength',
  ),
  edit(
    'the text of a NUL escape is taken for one',
    checks,
    "`'${BACKSLASH}${BACKSLASH}', '${BACKSLASH}u005c'`",
    "`'x', 'x'`",
  ),
  edit(
    "a lower bound takes Postgres' NaN",
    checks,
    'sql`(${condition} and ${column} <> ${NAN})`',
    'condition',
  ),
  edit(
    "an upper bound refuses Postgres' NaN",
    checks,
    'sql`(${condition} or ${column} = ${NAN})`',
    'condition',
  ),
  edit(
    'SQLite compiles a bound over a field that may be NaN',
    checks,
    "numeric && dialect === 'sqlite' && !finite",
    'false',
  ),
  edit('a finite rule is the server’s', checks, '  [FINITE]: (_, column', "  'x': (_, column"),
  edit(
    "a finite rule takes Postgres' Infinity",
    checks,
    "${column} < 'Infinity'::double precision",
    "${column} <= 'Infinity'::double precision",
  ),
  edit(
    'a float4 column compiles its bounds',
    checks,
    "const rounds = dialect === 'postgres' && column.getSQLType() === 'real'",
    'const rounds = false',
  ),
  edit(
    "a record's rules go unlisted",
    checks,
    '              ...ast.indexSignatures.flatMap(signature => [signature.parameter, signature.type]),\n',
    '',
  ),
  edit("a suspension's rules go unlisted", checks, '? inner(ast.thunk())', '? []'),
  edit(
    'a recursive schema is read without end',
    checks,
    'if (seen.has(ast)) return []',
    'if (seen.size < 0) return []',
  ),
  edit(
    'a table qualifier makes a check differ',
    checks,
    'unqualified(wanted, tableName) !== unqualified(condition, tableName)',
    'wanted !== condition',
  ),
  edit(
    'a qualifier is dropped inside a literal',
    checks,
    "(index % 2 === 0 ? part.replaceAll(`${quoted(table)}.`, '') : part)",
    "part.replaceAll(`${quoted(table)}.`, '')",
  ),
  edit(
    "a pattern's trailing dash is dropped",
    checks,
    "const body = `${parts.join('')}${dash}`",
    "const body = parts.join('')",
  ),
  edit('\\d is read as letters', checks, "escape === 'd' ? '0-9'", "escape === 'd' ? 'a-z'"),
  edit(
    "a literal compares under the column's own collation",
    checks,
    '? sql`${column} collate binary in (${list})`',
    '? sql`${column} in (${list})`',
  ),
  edit(
    'an exclusive maximum is held inclusively',
    checks,
    'exclusiveMaximum === true\n          ? sql`${column} < ${number(maximum)}`',
    'exclusiveMaximum === true\n          ? sql`${column} <= ${number(maximum)}`',
  ),
  edit(
    'an invariant passes a row it calls unknown',
    checks,
    'sql`(${condition}) is true`',
    'sql`(${condition})`',
  ),
  edit(
    'the decoded side is read for a stored rule',
    checks,
    'const encoded = SchemaAST.toEncoded(ast)',
    'const encoded = SchemaAST.toType(ast)',
  ),
  edit(
    'a rule no CHECK holds goes unreported',
    checks,
    '.filter(filter => !compiled.has(filter))',
    '.filter(() => false)',
  ),
  edit(
    'bind takes a column check whose rules are gone',
    checks,
    'if (wanted === undefined)',
    'if (false)',
  ),
  edit(
    'bind takes a check that says another rule',
    checks,
    'else if (unqualified(wanted, tableName) !== unqualified(condition, tableName))',
    'else if (false)',
  ),
  edit('bind takes a table missing a check', checks, 'if (held.length === 0) return', 'return'),
  edit(
    "bind reads a column's nullability from the decoded side",
    bind,
    'Schema.is(Schema.toEncoded(schema) as Schema.Codec<unknown>)',
    'Schema.is(Schema.toType(schema) as Schema.Codec<unknown>)',
  ),
  {
    name: 'a transition invariant goes unreported',
    edits: [
      {
        file: checks,
        find: 'serverOnly.push(`${owner}\'s invariant "${held.id}": reads the row before the write`)',
        replace: '',
      },
    ],
    tests: [...tests, 'packages/remote-drizzle/test/transition.test.ts'],
  },
  {
    name: 'a containment rule on Postgres compares under the column collation',
    edits: [{ file: checks, find: `}' collate "C"\``, replace: "}'`" }],
    tests,
    survives:
      'PGlite creates its database with the C collation, so the column collation is already binary there; a database created with a locale (the postgres-locale job) is where the difference would show.',
  },
]
