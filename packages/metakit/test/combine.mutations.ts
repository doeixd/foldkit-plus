const commutes = '../src/transitionCommutes.ts'
const tests = ['packages/metakit/test/combine.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'same-operation claims any operation commutes',
    commutes,
    '        Node.foreignName(opA) === Node.foreignName(opB) &&\n        opA.claims.commutative === true &&\n        opA.claims.associative === true',
    '        true',
  ),
  edit(
    'same-operation ignores foreignName equality',
    commutes,
    '        Node.foreignName(opA) === Node.foreignName(opB) &&\n        opA.claims.commutative === true',
    '        opA.claims.commutative === true',
  ),
  edit(
    'same-operation accepts unlessRefused associativity',
    commutes,
    '        opA.claims.associative === true',
    '        opA.claims.associative !== undefined',
  ),
  edit(
    'idempotent-operation ignores associative requirement',
    commutes,
    '        write.way.op.claims.idempotent !== true ||\n        write.way.op.claims.associative !== true',
    '        write.way.op.claims.idempotent !== true',
  ),
]
