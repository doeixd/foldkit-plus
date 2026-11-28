const divRem = '../src/ops/divRem.ts'
const tests = ['packages/metakit/test/divRem.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'divBig half-even rounds odd ties down instead of to even',
    divRem,
    'return qFloor % 2n === 0n ? qFloor : qFloor + 1n',
    'return qFloor',
  ),
  edit(
    'divBig half-away-from-zero rounds negative halves toward zero',
    divRem,
    'return num >= 0n ? qFloor + 1n : qFloor',
    'return qFloor + 1n',
  ),
  edit(
    'Num.div allows literal divisor 0 under onZero refuse',
    divRem,
    "  if (typeof right === 'number' && right === 0 && onZero === 'refuse') {\n    throw new Error(\n      '[metakit] Num.div: literal divisor is 0; pass a non-zero divisor or { onZero: \"null\" }.',",
    "  if (false && typeof right === 'number' && right === 0 && onZero === 'refuse') {\n    throw new Error(\n      '[metakit] Num.div: literal divisor is 0; pass a non-zero divisor or { onZero: \"null\" }.',",
  ),
  edit(
    'divInt returns 0 instead of null on zero when onZero is null',
    divRem,
    "return onZero === 'null'\n      ? null",
    "return onZero === 'null'\n      ? 0",
  ),
]
