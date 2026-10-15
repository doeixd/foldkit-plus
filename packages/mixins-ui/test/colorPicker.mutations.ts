/**
 * The color picker, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/colorPicker.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/colorPicker.test.ts']

export default [
  {
    name: "a channel's label names no input",
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: 'h.label(builders.channelLabel.attrs([h.For(inputId)]), [labels[channel.key]]),',
        replace: 'h.label(builders.channelLabel.attrs(), [labels[channel.key]]),',
      },
    ],
    tests,
  },
]
