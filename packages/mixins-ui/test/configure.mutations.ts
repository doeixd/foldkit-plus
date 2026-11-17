/**
 * `Button.configure` and `TagsInput.configure` draw through the shared merge:
 * `pnpm mutate packages/mixins-ui/test/configure.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/configure.test.ts']
const browser = ['packages/mixins-ui/test/configure.browser.test.ts']

export default [
  {
    name: 'a configured Button draws its base and preset',
    edits: [
      {
        file: '../src/button.ts',
        find: 'view: (options, h) => view(layered(config, options), h),',
        replace: 'view: (options, h) => view(options, h),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a configured TagsInput draws its base and preset',
    edits: [
      {
        file: '../src/tagsInput.ts',
        find: 'view: (options, h) => view(layered(config, options), h),',
        replace: 'view: (options, h) => view(options, h),',
      },
    ],
    tests: unit,
  },
  {
    name: "a preset's mixin is attached, so its Mount runs",
    edits: [
      {
        file: '../src/configure.ts',
        find: 'given(preset === undefined ? undefined : (presets[preset as string] as Layer)),',
        replace: 'given(undefined),',
      },
    ],
    tests: browser,
  },
  {
    name: 'a Mount runs only where its preset was named',
    edits: [
      {
        file: '../src/configure.ts',
        find: 'given(preset === undefined ? undefined : (presets[preset as string] as Layer)),',
        replace: 'given(Object.values(presets)[0] as Layer),',
      },
    ],
    tests: browser,
  },
]
