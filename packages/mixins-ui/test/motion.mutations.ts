/**
 * Motion under reduced motion, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/motion.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/motion.browser.test.ts']
const reset = '../../mixins/src/defaults.ts'
const design = '../src/recipes/design.ts'

export default [
  {
    name: 'reduced motion leaves travel alone',
    edits: [{ file: reset, find: '--fk-knob-travel:0!important;', replace: '' }],
    tests,
  },
  {
    name: 'a scoped theme can restore the travel',
    edits: [{ file: reset, find: '--fk-knob-travel:0!important;', replace: '--fk-knob-travel:0;' }],
    tests,
  },
  {
    name: 'an overlay ignores the travel knob',
    edits: [
      {
        file: design,
        find: 'export const travelled = (duration: string) => `calc(${duration} * ${ref.knob.travel})`',
        replace: 'export const travelled = (duration: string) => duration',
      },
    ],
    tests,
  },
  {
    name: 'the fade travels too',
    edits: [
      {
        file: design,
        find: 'transitionDuration: `${duration}, ${duration}, ${duration}, ${ref.motion.fast}`,',
        replace: 'transitionDuration: `${duration}, ${duration}, ${duration}, ${duration}`,',
      },
    ],
    tests,
  },
]
