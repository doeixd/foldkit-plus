/**
 * The Button's parts, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/buttonParts.mutations.ts --only "<name>"`.
 */
const unit = ['packages/mixins-ui/test/buttonParts.test.ts']
const browser = ['packages/mixins-ui/test/buttonParts.browser.test.ts']
const view = '../src/button.ts'
const recipe = '../src/recipes/button.ts'

export default [
  {
    name: 'a busy button still sends its press',
    edits: [
      {
        file: view,
        find: '...(options.onClick === undefined || busy ? {} : { onClick: options.onClick }),',
        replace: '...(options.onClick === undefined ? {} : { onClick: options.onClick }),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a busy submit still submits',
    edits: [
      {
        file: view,
        find: "{ type: busy ? 'button' : options.type }",
        replace: '{ type: options.type }',
      },
    ],
    tests: unit,
  },
  {
    name: 'an invalid button says aria-invalid',
    edits: [
      {
        file: view,
        find: "h.DataAttribute('invalid', '')",
        replace: "h.Attribute('aria-invalid', 'true')",
      },
    ],
    tests: unit,
  },
  {
    name: 'a busy button is not marked busy',
    edits: [{ file: view, find: 'h.AriaBusy(true), ', replace: '' }],
    tests: unit,
  },
  {
    name: 'a link is drawn as a button',
    edits: [
      {
        file: view,
        find: 'return options.href === undefined\n          ? h.button(slots.button, children)\n          : h.a(slots.button, children)',
        replace: 'return h.button(slots.button, children)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled link keeps its href',
    edits: [
      {
        file: view,
        find: 'options.disabled === true\n                  ?',
        replace: 'false\n                  ?',
      },
    ],
    tests: unit,
  },
  {
    name: 'an external link opens in the same tab',
    edits: [{ file: view, find: "h.Target('_blank'),", replace: '' }],
    tests: unit,
  },
  {
    name: 'a description is drawn without its box',
    edits: [
      {
        file: view,
        find: 'options.description === undefined',
        replace: 'true',
      },
    ],
    tests: unit,
  },
  {
    name: 'the trailing drawing is hidden from assistive technology',
    edits: [
      {
        file: view,
        find: 'h.span(slots.trailing, [options.trailing])',
        replace: 'h.span([...slots.trailing, h.AriaHidden(true)], [options.trailing])',
      },
    ],
    tests: unit,
  },
  {
    name: 'xs is as tall as sm',
    edits: [
      {
        file: recipe,
        find: "xs: { button: variant(Style.self({ '--fk-knob-step': '1.5' })) },",
        replace: "xs: { button: variant(Style.self({ '--fk-knob-step': '1' })) },",
      },
    ],
    tests: browser,
  },
  {
    name: 'a link button keeps its side padding',
    edits: [
      {
        file: recipe,
        find: "            paddingInline: '0',\n            textDecorationThickness",
        replace: '            textDecorationThickness',
      },
    ],
    tests: browser,
  },
  {
    name: 'a link button does not underline under the pointer',
    edits: [
      {
        file: recipe,
        find: "hover({ textDecorationLine: 'underline' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'an invalid button keeps its own colors',
    edits: [
      {
        file: recipe,
        find: "variant(Style.pseudo('[data-invalid]', dangerDeclarations)),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a description is as large as the label',
    edits: [{ file: recipe, find: "        ...role('caption'),\n", replace: '' }],
    tests: browser,
  },
  {
    name: 'the mark is placed on the physical right',
    edits: [
      {
        file: recipe,
        find: "insetInlineEnd: '-0.4em',",
        replace: "right: '-0.4em',",
      },
    ],
    tests: browser,
  },
  {
    name: 'a description adds no room',
    edits: [
      {
        file: recipe,
        find: "        paddingBlock: ref.space['2xs'],\n        textAlign: 'start',",
        replace: "        textAlign: 'start',",
      },
    ],
    tests: browser,
  },
]
