/**
 * Review of #610: SQL lowering parity.
 * `pnpm mutate packages/metakit/test/sql-review-610.mutations.ts`.
 */
const tests = [
  'packages/metakit/test/sql-bind-order.test.ts',
  'packages/metakit/test/sql-int4-neg.test.ts',
]

export default [
  {
    name: 'Postgres negates an integer operand without widening it',
    edits: [
      {
        file: '../src/sqlLowering.ts',
        find: `  // Postgres negates an \`int4\` in int4 arithmetic before any later cast, and raises on -2147483648.
  'num.neg': (args, ctx) =>
    ctx.dialect === 'postgres' && isIntegerTerm(args[0]!)
      ? one(args, ctx, inner => q\`(CAST((- CAST(\${inner} AS numeric)) AS bigint))\`)
      : one(args, ctx, inner => q\`(- \${inner})\`),`,
        replace: "  'num.neg': (args, ctx) => one(args, ctx, inner => q`(- ${inner})`),",
      },
    ],
    tests,
  },
  {
    name: 'a related aggregate binds its filter before its value',
    edits: [
      {
        file: '../src/sql.ts',
        find: `      // Value before filter: the subquery writes SELECT's value ahead of WHERE's filter,
      // and SQLite's \`?\` takes parameters in the order the text names them.
      return Result.flatMap(body(piece.value), value =>
        Result.flatMap(body(piece.where), where =>`,
        replace: `      return Result.flatMap(body(piece.where), where =>
        Result.flatMap(body(piece.value), value =>`,
      },
    ],
    tests,
  },
]
