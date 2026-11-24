const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/temporal.ts', find, replace }],
  tests: ['packages/metakit/test/temporal.test.ts'],
})

export default [
  mutation(
    'a held walk closes a pair with only one order observed',
    "coverage?.forward === 'observed' &&\n      coverage.reverse === 'observed'",
    "coverage?.forward === 'observed'",
  ),
  mutation(
    'the deterministic pair trials do not enforce the direction',
    '{ ...step, after: [...(step.after ?? []), before] }',
    'step',
  ),
]
