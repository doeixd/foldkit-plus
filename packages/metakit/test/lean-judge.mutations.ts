/**
 * The lean judge (`src/ops/judge.ts`) broken rule by rule: each must part
 * from what partial evaluation leaves, and the differential must say so:
 *   `pnpm mutate packages/metakit/test/lean-judge.mutations.ts`
 *
 * The laws themselves (`src/ops/laws.ts`) are not broken here: both readers
 * apply them, so breaking one moves both, and the property and partial
 * evaluation tests hold them.
 */
const judge = '../src/ops/judge.ts'

const tests = [
  'packages/metakit/test/lean-judge.differential.test.ts',
  'packages/entity/test/leanJudge.differential.test.ts',
]

const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: judge, find, replace }],
  tests,
})

export default [
  mutation(
    'two reads of one path are taken as two terms',
    'left.path.segments.length === right.path.segments.length &&',
    'false &&',
  ),
  mutation(
    'two calls of one operation on one argument are taken as two terms',
    'left.unary.id === right.unary.id &&',
    'false &&',
  ),
  mutation(
    'what is left is taken to be refusable whatever its Schema says',
    'cannotRefuse: judged => (isLeftover(judged) ? judged.cannotRefuse : admitted(judged)),',
    'cannotRefuse: judged => (isLeftover(judged) ? false : admitted(judged)),',
  ),
  mutation(
    'a read left over is not shown as a read',
    'isRead: judged => isLeftover(judged) && judged.path !== undefined,',
    'isRead: () => false,',
  ),
  mutation(
    'a read left over is taken to hold no NUL text whatever its Schema',
    '? judged.path !== undefined && isPortableRead(judged.path)',
    '? judged.path !== undefined',
  ),
  mutation(
    'a call of one argument left over is not shown as one',
    'unary: judged => (isLeftover(judged) ? judged.unary : undefined),',
    'unary: () => undefined,',
  ),
  mutation(
    'a call left over has no kind',
    'callKind(op, args.map(kindOfJudged)),',
    'Option.none(),',
  ),
  mutation(
    'a call left over is never shown unrefused',
    `callCannotRefuse(
      op,
      args.map(arg => [view.cannotRefuse(arg), kindOfJudged(arg)]),
    ),`,
    'false,',
  ),
  mutation(
    'a foreign call left over with no implementation is not named',
    'Node.isForeign(op) && !Object.hasOwn(foreign, Node.foreignName(op)) ? op : unsupportedIn(args),',
    'unsupportedIn(args),',
  ),
  mutation(
    'a read left over is refusable whatever its Schema',
    `            kindOf(path),
            cannotRefuse(path),`,
    `            kindOf(path),
            false,`,
  ),
  mutation(
    'an opaque term left over is not marked',
    'return new Leftover(Option.none(), false, undefined, undefined, opaque.reads, true, undefined)',
    'return new Leftover(Option.none(), false, undefined, undefined, opaque.reads, false, undefined)',
  ),
  mutation(
    'a strict call beside a known null is not folded',
    'if (nullBesideUnrefused(view, op, judged)) return null',
    '',
  ),
  mutation(
    'a call a fold rewrites to is taken as the operand',
    '? openCall(made.call, [made.operand, made.literal], foreign)',
    '? made.operand',
  ),
  mutation(
    'a body left over reads its element unexpanded',
    'readsOfRows(kept.over, from, read),',
    'read,',
  ),
  mutation(
    'an unsupported call is named before an opaque term',
    'const verdict = judged.opaque',
    'const verdict = judged.opaque && unsupported === undefined',
  ),
  mutation(
    'a path read twice is named twice',
    '...new Map(paths.map(segments => [JSON.stringify(segments), segments])).values(),',
    '...paths,',
  ),
]
