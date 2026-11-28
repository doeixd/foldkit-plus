/**
 * Mutation specification for Decisions 21 & 22:
 * - `permitsForeignRewrite` refuses absent policy and checks descriptor identity
 * - `guardedBy` coalesces null conditions to false
 * - symbolic `Fn` calls decode literals and guard param, where, returns, ensures
 * - `fn.run` and `Interpreter.runFn` enforce contracts by default
 */
const tests = [
  'packages/metakit/test/checked-by-default.test.ts',
  'packages/metakit/test/t3-branded-returns.test.ts',
]

export default [
  {
    name: 'permitsForeignRewrite returns true for an absent policy',
    edits: [
      {
        file: '../src/ops/laws.ts',
        find: '  if (policy === undefined) return false',
        replace: '  if (policy === undefined) return true',
      },
    ],
    tests,
  },
  {
    name: 'permitsForeignRewrite ignores descriptor identity',
    edits: [
      {
        file: '../src/ops/laws.ts',
        find: '          entry.descriptor === op &&',
        replace: '          Node.foreignName(entry.descriptor) === Node.foreignName(op) &&',
      },
    ],
    tests,
  },
  {
    name: 'guardedBy drops coalesce(cond, false)',
    edits: [
      {
        file: '../src/ops/guard.ts',
        find: '          cond: Node.Call({ op: coalesceOp, args: [cond, Node.Lit({ value: false })] }),',
        replace: '          cond,',
      },
    ],
    tests,
  },
  {
    name: 'fn symbolic call drops literal argument decoding',
    edits: [
      {
        file: '../src/fn.ts',
        find: "      if (Node.$is('Lit')(argNode)) {\n        Schema.decodeUnknownSync(paramSchema as unknown as Schema.Codec<unknown>)(argNode.value)\n      }",
        replace:
          "      if (false && Node.$is('Lit')(argNode)) {\n        Schema.decodeUnknownSync(paramSchema as unknown as Schema.Codec<unknown>)(argNode.value)\n      }",
      },
    ],
    tests,
  },
  {
    name: 'fn symbolic call drops parameter guard',
    edits: [
      {
        file: '../src/fn.ts',
        find: '    for (const [name, paramSchema] of paramEntries) {\n      const argNode = argNodes.get(name)!',
        replace:
          '    for (const [name, paramSchema] of [] as typeof paramEntries) {\n      const argNode = argNodes.get(name)!',
      },
    ],
    tests,
  },
  {
    name: 'fn symbolic call drops where guard',
    edits: [
      {
        file: '../src/fn.ts',
        find: '    for (const w of parts.whereClauses) {\n      conditions.push({',
        replace: '    for (const w of [] as typeof parts.whereClauses) {\n      conditions.push({',
      },
    ],
    tests,
  },
  {
    name: 'fn symbolic call drops returns guard',
    edits: [
      {
        file: '../src/fn.ts',
        find: '    if (Option.isSome(parts.returnSchema)) {\n      const retSchema = parts.returnSchema.value',
        replace:
          '    if (false && Option.isSome(parts.returnSchema)) {\n      const retSchema = parts.returnSchema.value',
      },
    ],
    tests,
  },
  {
    name: 'fn symbolic call drops ensures guard',
    edits: [
      {
        file: '../src/fn.ts',
        find: '    for (const e of parts.ensuresClauses) {\n      conditions.push({',
        replace:
          '    for (const e of [] as typeof parts.ensuresClauses) {\n      conditions.push({',
      },
    ],
    tests,
  },
  {
    name: 'fn.run skips contract checking',
    edits: [
      {
        file: '../src/fn.ts',
        find: '  const run = (args: ParamValues<P>, options?: Expr.ReaderOptions): R =>\n    Result.getOrThrow(runChecked(args, options))',
        replace:
          '  const run = (args: ParamValues<P>, options?: Expr.ReaderOptions): R =>\n    Expr.evaluate(parts.body, args, options)',
      },
    ],
    tests,
  },
  {
    name: 'Interpreter.runFn skips contract checking',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: '    runFn: (fn, args) => Effect.fromResult(fn.runChecked(args, readerOptions)),',
        replace:
          '    runFn: (fn, args) => Effect.fromResult(Expr.evalResult(fn.body, args, readerOptions)) as never,',
      },
    ],
    tests,
  },
]
