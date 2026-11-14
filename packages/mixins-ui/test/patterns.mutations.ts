/**
 * Pattern obligations and the catalog, broken in turn: `pnpm mutate packages/mixins-ui/test/patterns.mutations.ts`.
 */
const tests = [
  'packages/mixins-ui/test/patterns.test.ts',
  'packages/mixins-ui/test/catalogComplete.test.ts',
]

export default [
  {
    name: 'a listbox does not ask for navigation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "obligations: ['navigation'],\n    optional: true,\n  },\n  item: {\n    capability: Capability.Interactive,\n    events: [Event.Click],\n    attributes: [Attr.Role, Attr.AriaSelected],\n",
        replace:
          'optional: true,\n  },\n  item: {\n    capability: Capability.Interactive,\n    events: [Event.Click],\n    attributes: [Attr.Role, Attr.AriaSelected],\n',
      },
    ],
    tests,
  },
  {
    name: 'a listbox item does not ask for focus or activation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "    obligations: ['focus', 'activation'],\n  },\n})\n\nexport const Menu",
        replace: '  },\n})\n\nexport const Menu',
      },
    ],
    tests,
  },
  {
    name: 'a checkbox does not ask for checked or activation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "  checkbox: {\n    capability: Capability.Interactive,\n    events: [Event.Click],\n    attributes: [Attr.Role],\n    obligations: ['checked', 'activation'],\n  },\n  label:",
        replace:
          '  checkbox: {\n    capability: Capability.Interactive,\n    events: [Event.Click],\n    attributes: [Attr.Role],\n  },\n  label:',
      },
    ],
    tests,
  },
  {
    name: 'a tab does not ask for navigation, focus or activation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "    attributes: [Attr.Role, Attr.AriaSelected],\n    obligations: ['navigation', 'focus', 'activation'],\n  },\n  panel",
        replace: '    attributes: [Attr.Role, Attr.AriaSelected],\n  },\n  panel',
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
    name: 'the menu names its navigation provider on the wrong slot',
    edits: [
      {
        file: '../src/patterns.ts',
        find: "slot: 'items',\n        obligation: 'navigation',\n        provider: '@foldkit/ui/menu items keydown",
        replace:
          "slot: 'item',\n        obligation: 'navigation',\n        provider: '@foldkit/ui/menu items keydown",
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
]
