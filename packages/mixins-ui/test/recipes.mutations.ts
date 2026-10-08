/**
 * The recipes' fixes, broken in turn: `pnpm mutate packages/mixins-ui/test/recipes.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/recipes.test.ts']

export default [
  {
    name: 'the pressed option is a component rule, under an icon button’s background',
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: '    group: variant(\n      // One pressed rule',
        replace: '    group: component(\n      // One pressed rule',
      },
    ],
    tests,
  },
  {
    name: 'an icon button keeps its gap',
    edits: [{ file: '../src/recipes/button.ts', find: "            gap: '0',\n", replace: '' }],
    tests,
  },
  {
    name: 'an unfilled hover is a solid ground',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "export const unfilledHover = 'color-mix(in oklab, currentColor 12%, transparent)'",
        replace: 'export const unfilledHover = ref.surface.muted',
      },
    ],
    tests,
  },
  {
    name: 'a popup panel floats above later content',
    edits: [{ file: '../src/recipes/popup.ts', find: "    zIndex: '20',\n", replace: '' }],
    tests,
  },
  {
    name: 'a chosen listbox row takes the accent wash',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: '        { true: { background: ref.accent.subtle, color: ref.accent.ink } },',
        replace: '        { true: { background: ref.surface.muted, color: ref.text.default } },',
      },
    ],
    tests,
  },
  {
    name: 'a chosen combobox row takes the accent wash',
    edits: [
      {
        file: '../src/recipes/combobox.ts',
        find: '        { true: { background: ref.accent.subtle, color: ref.accent.ink } },',
        replace: '        { true: { background: ref.surface.muted, color: ref.text.default } },',
      },
    ],
    tests,
  },
  {
    name: 'a combobox rings while its input has focus',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "export const focusWithin: StyleValue = Style.pseudo(':focus-within', {",
        replace: "export const focusWithin: StyleValue = Style.pseudo(':focus', {",
      },
    ],
    tests,
  },
  {
    name: 'a select keeps room for the value on every size',
    edits: [
      {
        file: '../src/recipes/select.ts',
        find: '  variant(Style.self({ paddingBlock: block, paddingInline: `${inline} 2rem`, fontSize: font }))',
        replace:
          '  variant(Style.self({ paddingBlock: block, paddingInline: inline, fontSize: font }))',
      },
    ],
    tests,
  },
  {
    name: 'a neutral radio checks in ink, not the pale surface',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: '      neutral: { option: tones.ink },',
        replace: '      neutral: { option: tones.neutral },',
      },
    ],
    tests,
  },
  {
    name: 'a checked radio dot sits on whole pixels',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: "        inset: '3px',",
        replace: "        inset: '25%',",
      },
    ],
    tests,
  },
  {
    name: 'a slider fills in its tone',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: "        background: toneVar('fill'),",
        replace: '        background: ref.surface.muted,',
      },
    ],
    tests,
  },
  {
    name: 'a toast stacks above the page',
    edits: [{ file: '../src/recipes/toast.ts', find: "        zIndex: '50',\n", replace: '' }],
    tests,
  },
  {
    name: 'a drop zone draws dashed until a drag hovers',
    edits: [
      {
        file: '../src/recipes/fileDrop.ts',
        find: '        border: `${ref.border.thin} dashed ${ref.outline.default}`,',
        replace: '        border: `${ref.border.thin} solid ${ref.outline.default}`,',
      },
    ],
    tests,
  },
  {
    name: 'a date picker trigger draws its line',
    edits: [
      {
        file: '../src/recipes/datePicker.ts',
        find: '        border: `${ref.border.thin} solid ${ref.outline.default}`,',
        replace: '        border: `${ref.border.thin} solid ${ref.outline.subtle}`,',
      },
    ],
    tests,
  },
  {
    name: 'a large popover panel takes its width',
    edits: [
      {
        file: '../src/recipes/popover.ts',
        find: "      lg: { panel: width('32rem') },",
        replace: "      lg: { panel: width('18rem') },",
      },
    ],
    tests,
  },
  {
    name: 'a tooltip pill reads on any ground',
    edits: [
      {
        file: '../src/recipes/tooltip.ts',
        find: '        background: ref.text.overt,',
        replace: '        background: ref.surface.muted,',
      },
    ],
    tests,
  },
  {
    name: 'a dialog sinks to the modal step',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: "        boxShadow: ref.shadow['2xl'],",
        replace: '        boxShadow: ref.shadow.xl,',
      },
    ],
    tests,
  },
  {
    name: 'a disabled tooltip trigger dims instead of inviting hover',
    edits: [
      {
        file: '../src/recipes/tooltip.ts',
        find: '      // of inviting hover it will not answer.\n      disabled,',
        replace: '      // of inviting hover it will not answer.',
      },
    ],
    tests,
  },
  {
    name: 'an invalid select lines itself in error',
    edits: [
      {
        file: '../src/recipes/select.ts',
        find: "      Style.states({ true: { borderColor: ref.error.outline } }, 'aria-invalid'),",
        replace:
          "      Style.states({ true: { borderColor: ref.outline.default } }, 'aria-invalid'),",
      },
    ],
    tests,
  },
  {
    name: 'a disabled menu trigger dims like its rows',
    edits: [
      {
        file: '../src/recipes/menu.ts',
        find: '      hover({ background: ref.surface.muted }),\n      focusRing,\n      // The contract lets the trigger disable, like the items it opens.\n      disabled,',
        replace: '      hover({ background: ref.surface.muted }),\n      focusRing,',
      },
    ],
    tests,
  },
]
