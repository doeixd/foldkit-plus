const tests = ['examples/widgets/test/ui-sdk-search-field.test.ts']

export default [
  {
    name: 'typing ignores the supplied text',
    edits: [
      {
        file: '../src/ui-sdk-search-field.ts',
        find: 'value === model.value ? { model } : { model: modifyFields(model, { value: () => value }) },',
        replace: '{ model },',
      },
    ],
    tests,
  },
  {
    name: 'clearing leaves the value unchanged',
    edits: [
      {
        file: '../src/ui-sdk-search-field.ts',
        find: "model.value === '' ? { model } : { model: modifyFields(model, { value: () => '' }) },",
        replace: '{ model },',
      },
    ],
    tests,
  },
  {
    name: 'the second view routes to the first placement',
    edits: [
      {
        file: '../src/ui-sdk-search-field.ts',
        find: "h.section([h.Id('second')], [second.view(model, h)])",
        replace: "h.section([h.Id('second')], [first.view(model, h)])",
      },
    ],
    tests,
  },
]
