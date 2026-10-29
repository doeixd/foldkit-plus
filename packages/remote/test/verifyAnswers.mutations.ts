/**
 * `verifyPredictions`' Gap, broken in turn:
 * `pnpm mutate packages/remote/test/verifyAnswers.mutations.ts`.
 */
const tests = ['packages/remote/test/verifyAnswers.test.ts']
const index = '../src/index.ts'
const gaps = '../src/answerGaps.ts'

export default [
  {
    name: 'every answer is checked',
    edits: [
      {
        file: index,
        find: 'answer === undefined || options.verifyPredictions !== true',
        replace: 'answer === undefined',
      },
    ],
    tests,
  },
  {
    name: 'a repeated answer is checked again',
    edits: [
      {
        file: index,
        find: 'if (before.mutations.applied.has(requestId)) return after',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'what the Surfaces read is not shown',
    edits: [
      {
        file: index,
        find: 'planAsked(unverified(after), askedUnion(projections), {}, operators).requirements,',
        replace: '[],',
      },
    ],
    tests,
  },
  {
    name: 'a patched field is not shown',
    edits: [{ file: gaps, find: '        ...Object.keys(patch.values),', replace: '' }],
    tests,
  },
  {
    name: 'a field moved by an amount is not shown',
    edits: [{ file: gaps, find: '        ...Object.keys(patch.adds ?? {}),', replace: '' }],
    tests,
  },
  {
    name: 'an inserted row is not shown',
    edits: [
      {
        file: gaps,
        find: 'for (const edge of overlay.edges) show(edge.ref.entity, edge.ref.id, [])',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'what the store holds is a gap',
    edits: [
      {
        file: gaps,
        find: 'field => entry === undefined || !(entry.present.has(field) || entry.unavailable.has(field)),',
        replace: 'field => entry === undefined || !entry.unavailable.has(field),',
      },
    ],
    tests,
  },
  {
    name: 'a row gone from view is a gap',
    edits: [
      {
        file: gaps,
        find: 'if (entry === undefined ? !asked.has(key) : entry.tombstone) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a deleted row is a gap',
    edits: [
      {
        file: gaps,
        find: 'if (entry === undefined ? !asked.has(key) : entry.tombstone) continue',
        replace: 'if (entry === undefined && !asked.has(key)) continue',
      },
    ],
    tests,
  },
  {
    name: 'gaps replace those kept before',
    edits: [
      {
        file: index,
        find: 'diagnostics: withDiagnostics(after.diagnostics, found)',
        replace: 'diagnostics: found',
      },
    ],
    tests,
  },
  {
    name: 'a gap names no mutation',
    edits: [
      {
        file: index,
        find: '      write => write.mutation,',
        replace: '        () => undefined as never,',
      },
    ],
    tests,
  },
]
