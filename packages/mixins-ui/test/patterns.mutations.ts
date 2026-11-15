/**
 * The catalog, its obligations and their suppliers, broken in turn: `pnpm mutate packages/mixins-ui/test/patterns.mutations.ts`.
 * `Patterns.Listbox` and `Patterns.Checkbox` obligations are in `patternObligations.mutations.ts`.
 */
const tests = [
  'packages/mixins-ui/test/patterns.test.ts',
  'packages/mixins-ui/test/catalogComplete.test.ts',
]

export default [
  {
    name: 'a tab does not ask for navigation, focus or activation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: '    attributes: [Attr.Role, Attr.AriaSelected],\n    obligations: [A11y.Navigation, A11y.FocusStrategy, A11y.Activation],\n  },\n  panel',
        replace: '    attributes: [Attr.Role, Attr.AriaSelected],\n  },\n  panel',
      },
    ],
    tests,
  },
  {
    name: 'a tab panel does not ask for a name',
    edits: [
      {
        file: '../src/patterns.ts',
        find: 'panel: { capability: Capability.Container, attributes: [Attr.Role], obligations: [A11y.Name] },',
        replace: 'panel: { capability: Capability.Container, attributes: [Attr.Role] },',
      },
    ],
    tests,
  },
  {
    name: 'the menu items do not ask for a name',
    edits: [
      {
        file: '../src/patterns.ts',
        find: '    optional: true,\n    obligations: [A11y.Navigation, A11y.Name],\n  },\n  item: {\n    capability: Capability.Interactive,\n    events: [Event.Click],\n    attributes: [Attr.Role],',
        replace:
          '    optional: true,\n    obligations: [A11y.Navigation],\n  },\n  item: {\n    capability: Capability.Interactive,\n    events: [Event.Click],\n    attributes: [Attr.Role],',
      },
    ],
    tests,
  },
  {
    name: 'the picker option does not ask for navigation, focus or activation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: '    attributes: [Attr.Role, Attr.AriaSelected],\n    obligations: [A11y.Navigation, A11y.FocusStrategy, A11y.Activation],\n  },\n})\n\n/** A named group of buttons. */',
        replace:
          '    attributes: [Attr.Role, Attr.AriaSelected],\n  },\n})\n\n/** A named group of buttons. */',
      },
    ],
    tests,
  },
  {
    name: 'the catalog carries no support',
    edits: [
      {
        file: '../src/patterns.ts',
        find: 'Object.freeze({ name, pattern, slots, tier, roles, floor, support })',
        replace: 'Object.freeze({ name, pattern, slots, tier, roles, floor, support: [] })',
      },
    ],
    tests,
  },
  {
    name: 'the tabs supplier of focus names the wrong slot',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "(tabs/index.js)', 'tab', FocusStrategy),",
        replace: "(tabs/index.js)', 'panel', FocusStrategy),",
      },
    ],
    tests,
  },
  {
    name: 'the accordion native button claims navigation it does not supply',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "native('button', 'trigger', Activation),",
        replace: "native('button', 'trigger', Activation, Navigation),",
      },
    ],
    tests,
  },
  {
    name: 'the accordion drops its native activation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "      native('button', 'trigger', Activation),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the catalog drops a widget',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "  entry('card', Card, CardSlots, 'stateless', ['list', 'link', 'button']),\n",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/catalogComplete.test.ts'],
  },
  {
    name: 'a checkbox pattern does not require aria-checked',
    edits: [
      {
        file: '../src/patterns.ts',
        find: 'export const Checkbox = A11y.pattern({\n  checkbox: {\n    capability: Capability.Interactive,\n    events: [Event.Click],\n    attributes: [Attr.Role, Attr.AriaChecked, Attr.AriaLabelledby],',
        replace:
          'export const Checkbox = A11y.pattern({\n  checkbox: {\n    capability: Capability.Interactive,\n    events: [Event.Click],\n    attributes: [Attr.Role, Attr.AriaLabelledby],',
      },
    ],
    tests,
  },
  {
    name: 'a pagination landmark does not require its name',
    edits: [
      {
        file: '../src/patterns.ts',
        find: 'root: { capability: Capability.Container, attributes: [Attr.Role, Attr.AriaLabel] },\n  prev:',
        replace: 'root: { capability: Capability.Container },\n  prev:',
      },
    ],
    tests,
  },
  {
    name: 'a breadcrumb current step does not require aria-current',
    edits: [
      {
        file: '../src/patterns.ts',
        find: 'current: { capability: Capability.Container, attributes: [Attr.AriaCurrent] },',
        replace: 'current: { capability: Capability.Container },',
      },
    ],
    tests,
  },
  {
    name: 'a segmented option does not ask for aria-checked',
    edits: [
      {
        file: '../src/patterns.ts',
        find: '      A11y.State(Attr.AriaPressed),\n      A11y.State(Attr.AriaChecked),\n    ],\n  },\n  hiddenInput',
        replace: '      A11y.State(Attr.AriaPressed),\n    ],\n  },\n  hiddenInput',
      },
    ],
    tests,
  },
  {
    name: 'a nav link does not require keydown',
    edits: [
      {
        file: '../src/patterns.ts',
        find: '  link: { capability: Capability.Interactive, events: [Event.KeyDown] },\n  panelLink',
        replace: '  link: { capability: Capability.Interactive },\n  panelLink',
      },
    ],
    tests,
  },
  {
    name: 'a rating star does not require keydown',
    edits: [
      {
        file: '../src/patterns.ts',
        find: 'events: [Event.Change, Event.KeyDown],\n    attributes: [Attr.AriaLabel],\n    obligations: [A11y.Navigation, A11y.FocusStrategy],',
        replace:
          'events: [Event.Change],\n    attributes: [Attr.AriaLabel],\n    obligations: [A11y.Navigation, A11y.FocusStrategy],',
      },
    ],
    tests,
  },
]
