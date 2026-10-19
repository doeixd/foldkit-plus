/**
 * The color scales, broken in turn:
 * `pnpm mutate packages/mixins/test/scales.mutations.ts`.
 */
const unit = ['packages/mixins/test/themePage.test.ts']
const file = '../src/theme/oklch.ts'

export default [
  {
    name: 'a step leaves the shared ladder',
    edits: [
      { file, find: 'const scaleL = [97, 88.5, 80,', replace: 'const scaleL = [97, 80, 88.5,' },
    ],
    tests: unit,
  },
  {
    name: 'every scale takes one hue',
    edits: [
      {
        file,
        find: "const hue = v('knob', `${name}-h`)",
        replace: "const hue = v('knob', 'red-h')",
      },
    ],
    tests: unit,
  },
  {
    name: 'a wash mixes another step',
    edits: [{ file, find: "${v(name, '6')} ${share}%", replace: "${v(name, '5')} ${share}%" }],
    tests: unit,
  },
  {
    name: 'a wash mixes over no page',
    edits: [{ file, find: "${share}%, ${v('surface', 'base')})", replace: '${share}%, white)' }],
    tests: unit,
  },
]
