/**
 * The filled variant's invalid edge, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/fieldVariants.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/fieldVariants.browser.test.ts']
const recipe = '../src/recipes/field.ts'

export default [
  {
    name: 'a filled control loses its invalid edge',
    edits: [
      {
        file: recipe,
        find: "borderColor: 'transparent' }),\n  Style.pseudo('[aria-invalid=\"true\"]', { borderColor: ref.error.outline }),",
        replace: "borderColor: 'transparent' }),",
      },
    ],
    tests,
  },
  {
    name: 'a filled frame loses its invalid edge',
    edits: [
      {
        file: recipe,
        find: '\n  Style.pseudo(\':has([aria-invalid="true"])\', { borderColor: ref.error.outline }),',
        replace: '',
      },
    ],
    tests,
  },
]
