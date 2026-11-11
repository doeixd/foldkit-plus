/**
 * The submit button's disabled state, broken in turn: `pnpm mutate packages/mixins-form/test/submitKeys.mutations.ts`.
 */
const file = '../src/index.ts'
const browser = 'packages/mixins-form/test/submitKeys.browser.test.ts'
const drawn = '...(!input.canSubmit || submitting ? [h.AriaDisabled(true)] : [])'

export default [
  {
    name: 'a form that cannot submit draws its button natively disabled',
    edits: [{ file, find: drawn, replace: '...(!input.canSubmit ? [h.Disabled(true)] : [])' }],
    tests: [browser],
  },
  {
    name: 'a form that cannot submit never reads aria-disabled',
    edits: [{ file, find: drawn, replace: '...(submitting ? [h.AriaDisabled(true)] : [])' }],
    tests: [browser],
  },
  {
    name: 'a form that is submitting does not read aria-disabled',
    edits: [{ file, find: drawn, replace: '...(!input.canSubmit ? [h.AriaDisabled(true)] : [])' }],
    tests: ['packages/mixins-form/test/view.test.ts'],
  },
] satisfies ReadonlyArray<{
  readonly name: string
  readonly edits: ReadonlyArray<{
    readonly file: string
    readonly find: string
    readonly replace: string
  }>
  readonly tests: ReadonlyArray<string>
}>
