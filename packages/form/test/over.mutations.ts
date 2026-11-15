/**
 * A form judging invariants over the row it edits, each step broken in turn:
 * `pnpm mutate packages/form/test/over.mutations.ts`.
 */
const tests = ['packages/form/test/over.test.ts', 'packages/form/test/invariant.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/index.ts', find, replace }],
  tests,
})

export default [
  edit(
    'the row is dropped from the judgement',
    'over: Option.getOrUndefined(model.over),',
    'over: undefined,',
  ),
  edit('an edit judges nothing', 'model: judgedOnEdit(result.model),', 'model: result.model,'),
  edit('a form with no row judges on an edit', 'if (Option.isNone(model.over)) return model', ''),
  edit(
    'a blur judges',
    "case 'Blurred':\n          case 'FollowedIssue':",
    "case 'Blurred':\n            return { model: judgedOnEdit(model) }\n          case 'FollowedIssue':",
  ),
  edit(
    'a failure shows before every key it reads is reached',
    'setting.every(key => model.reached[key] === true)',
    'true',
  ),
  edit(
    'a failure the form sets nothing of shows on an edit',
    'return setting.length > 0 && setting',
    'return setting',
  ),
  edit(
    'a fill keeps the keys reached',
    'Object.entries(model.reached).filter(([key]) => !Object.hasOwn(given, key)),',
    'Object.entries(model.reached),',
  ),
  edit(
    'a reset keeps the row',
    'return { model: { ...initial, subject: model.subject } }',
    'return { model: { ...initial, subject: model.subject, over: model.over } }',
  ),
  edit(
    'a relation key the form sets is not counted',
    'RelationInput: ({ relation }) => [[relation.key, key] as const],',
    'RelationInput: () => [],',
  ),
]
