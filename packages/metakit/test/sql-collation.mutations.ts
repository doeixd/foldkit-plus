/**
 * Review of #610: a SQLite column's declared collation must not widen text
 * ordering or identity (#621).
 * `pnpm mutate packages/metakit/test/sql-collation.mutations.ts`.
 */
const tests = ['packages/metakit/test/sql-collation.test.ts']

export default [
  {
    name: 'text ordering leaves the column collation in force',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: '        : q`(${left} COLLATE BINARY ${operator} ${right})`,',
        replace: '        : q`(${left} ${operator} ${right})`,',
      },
    ],
    tests,
  },
  {
    name: 'text equality leaves the column collation in force',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: `      both(args, ctx, (left, right) =>
        text && ctx.dialect === 'sqlite'
          ? q\`(\${left} COLLATE BINARY \${operator(ctx.dialect)} \${right})\`
          : q\`(\${left} \${operator(ctx.dialect)} \${right})\`,`,
        replace: `      both(args, ctx, (left, right) =>
        q\`(\${left} \${operator(ctx.dialect)} \${right})\`,`,
      },
    ],
    tests,
  },
  {
    name: 'text membership leaves the column collation in force',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: `      const target =
        ctx.dialect === 'sqlite' && needleKind(args[0]!) === 'text'
          ? q\`\${needle} COLLATE BINARY\`
          : needle
      const present = candidates.filter(item => item !== null && item !== undefined)`,
        replace: `      const target = needle
      const present = candidates.filter(item => item !== null && item !== undefined)`,
      },
    ],
    tests,
  },
  {
    name: 'a match leaves the column collation in force',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: `            const target =
              ctx.dialect === 'sqlite' && needleKind(on) === 'text'
                ? q\`(\${rawTarget} COLLATE BINARY)\`
                : rawTarget`,
        replace: '            const target = rawTarget',
      },
    ],
    tests,
  },
  {
    name: 'startsWith leaves the column collation in force',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: '        : q`(substr(${s}, 1, length(${prefix})) COLLATE BINARY = ${prefix})`,',
        replace: '        : q`(substr(${s}, 1, length(${prefix})) = ${prefix})`,',
      },
    ],
    tests,
  },
]
