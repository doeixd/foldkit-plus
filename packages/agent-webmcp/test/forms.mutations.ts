/**
 * Form tools, broken in turn: `pnpm mutate packages/agent-webmcp/test/forms.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/agent-webmcp/test/forms.test.ts']
const forms = '../src/forms.ts'
const register = '../src/register.ts'

export default [
  {
    name: 'a field is not described',
    edits: [
      {
        file: forms,
        find: "onSome: description => [h.Attribute('toolparamdescription', description)],",
        replace: 'onSome: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'autosubmit is never asked for',
    edits: [{ file: forms, find: 'options.autosubmit === true', replace: 'false' }],
    tests,
  },
  {
    name: 'an unknown field is named anyway',
    edits: [{ file: forms, find: 'if (described === undefined)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'a person’s submission is answered too',
    edits: [
      {
        file: forms,
        find: "if (!('agentInvoked' in event) || event.agentInvoked !== true) return",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a form for another tool is answered as the first',
    edits: [
      {
        file: forms,
        find: "const tool = byName.get(form.getAttribute('toolname') ?? '')",
        replace: 'const tool = forms[0]',
      },
    ],
    tests,
  },
  {
    name: 'the application’s handler runs too',
    edits: [{ file: forms, find: '    event.stopImmediatePropagation()\n', replace: '' }],
    tests,
  },
  {
    name: 'every field of the form is read',
    edits: [
      {
        file: forms,
        find: 'for (const key of tool.keys) {',
        replace: 'for (const key of [...data.keys()]) {',
      },
    ],
    tests,
  },
  {
    name: 'unregistering keeps answering',
    edits: [{ file: register, find: '    stopAnswering()\n', replace: '' }],
    tests,
  },
  {
    name: 'a form’s capability is registered in a browser that draws forms',
    edits: [{ file: register, find: 'asForms.has(descriptor.name) ? []', replace: 'false ? []' }],
    tests,
  },
  {
    name: 'a form’s capability is not registered where the browser draws no forms',
    edits: [
      { file: register, find: 'declarativeTools() ? forms.map', replace: 'true ? forms.map' },
    ],
    tests,
  },
]
