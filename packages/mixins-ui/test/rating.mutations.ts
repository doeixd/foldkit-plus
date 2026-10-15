/**
 * The rating, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/rating.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/rating.test.ts'

export default [
  {
    name: 'every star up to the one given is checked',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.Checked(value === given)',
        replace: 'h.Checked(value <= given)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the star given is not filled',
    edits: [
      {
        file: '../src/rating.ts',
        find: "h.DataAttribute('filled', String(value <= given))",
        replace: "h.DataAttribute('filled', String(value < given))",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a choice sends the rating already given',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.OnChange(() => options.onChange(value))',
        replace: 'h.OnChange(() => options.onChange(given))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the radios are grouped by a client-only property',
    edits: [
      {
        file: '../src/rating.ts',
        find: "h.Attribute('name', options.id),",
        replace: 'h.Name(options.id),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled rating still takes a choice',
    edits: [
      {
        file: '../src/rating.ts',
        find: '...(disabled ? [h.Disabled(true)] : [h.OnChange(() => options.onChange(value))]),',
        replace: 'h.OnChange(() => options.onChange(value)),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the group is not named by its label',
    edits: [
      {
        file: '../src/rating.ts',
        find: "h.Role('radiogroup'), h.AriaLabelledBy(labelId)",
        replace: "h.Role('radiogroup')",
      },
    ],
    tests: [unit],
  },
  {
    name: 'read-only, the rating does not say out of how many',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'onSome: value => `${starLabel(value)} of ${max}`,',
        replace: 'onSome: value => starLabel(value),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'read-only, the label is read twice',
    edits: [
      {
        file: '../src/rating.ts',
        find: 'h.span(builders.label.attrs([h.AriaHidden(true)]), [options.label])',
        replace: 'h.span(builders.label.attrs([]), [options.label])',
      },
    ],
    tests: [unit],
  },
]
