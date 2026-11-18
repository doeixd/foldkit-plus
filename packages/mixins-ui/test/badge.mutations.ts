/**
 * The badge, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/badge.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/badge.test.ts']
const recipe = ['packages/mixins-ui/test/recipes.test.ts']
const browser = ['packages/mixins-ui/test/badge.browser.test.ts']

export default [
  {
    name: 'the padding ignores the density knob',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: 'paddingInline: `calc(${ref.space.xs} * 1.2)`,',
        replace: "paddingInline: '0.6rem',",
      },
    ],
    tests: browser,
  },
  {
    name: 'pills lose their tone attribute',
    edits: [
      {
        file: '../src/badge.ts',
        find: "options.tone === undefined ? [] : [h.DataAttribute('tone', options.tone)]",
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'success fills with ink instead of its tint',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: "'--_fk-badge-tint': ref[family].subtle,",
        replace: "'--_fk-badge-tint': ref[family].ink,",
      },
    ],
    tests: browser,
  },
  {
    name: 'every appearance is tinted',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: 'solid: { badge: variant(Style.self({ background: fill, color: onFill })) },',
        replace: 'solid: { badge: variant(Style.self({ background: tint, color: ink })) },',
      },
    ],
    tests: browser,
  },
  {
    name: 'a dot badge draws no dot',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: '          dot,\n        ),',
        replace: '        ),',
      },
    ],
    tests: browser,
  },
  {
    name: 'the solid fill ignores the tone',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: "'--_fk-badge-fill': ref[family].default,",
        replace: "'--_fk-badge-fill': ref.text.muted,",
      },
    ],
    tests: browser,
  },
  {
    name: 'an outline badge draws no line',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: '            boxShadow: `inset 0 0 0 ${ref.border.thin} ${line}`,\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'danger reads the info family',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: "danger: properties('error'),",
        replace: "danger: properties('info'),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a size leaves the text where it was',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: "            ...role('micro'),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'badgeTones writes the value into the wrong attribute',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: 'Style.nest(`&[${attribute}="${value}"]`, toneStates[tone]),',
        replace: 'Style.nest(`&[data-state="${value}"]`, toneStates[tone]),',
      },
    ],
    tests: recipe,
  },
  {
    name: 'the dismiss button is named for nothing',
    edits: [
      {
        file: '../src/badge.ts',
        find: 'h.AriaLabel(fill(text.dismiss, { text: options.text })),',
        replace: 'h.AriaLabel(text.dismiss),',
      },
    ],
    tests,
  },
  {
    name: 'an external link opens in the same tab',
    edits: [
      {
        file: '../src/badge.ts',
        find: "? [h.Target('_blank'), h.Rel('noopener noreferrer'), h.AriaDescription(text.external)]",
        replace: "? [h.Rel('noopener noreferrer'), h.AriaDescription(text.external)]",
      },
    ],
    tests,
  },
  {
    name: 'the icon is read to assistive technology',
    edits: [
      {
        file: '../src/badge.ts',
        find: 'builders.icon.attrs([h.AriaHidden(true)])',
        replace: 'builders.icon.attrs([])',
      },
    ],
    tests,
  },
]
