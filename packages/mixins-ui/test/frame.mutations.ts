/**
 * The frame, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/frame.mutations.ts` checks that a test
 * fails for every one.
 */
const unit = ['packages/mixins-ui/test/frame.test.ts']
const browser = ['packages/mixins-ui/test/frame.browser.test.ts']
const view = '../src/frame.ts'
const recipe = '../src/recipes/frame.ts'

export default [
  {
    name: 'the panels are drawn without their panel',
    edits: [
      {
        file: view,
        find: 'options.panels.map(panel => h.div(builders.panel.attrs(), [panel])),',
        replace: 'options.panels,',
      },
    ],
    tests: unit,
  },
  {
    name: 'the heading level is ignored',
    edits: [{ file: view, find: '})[level]', replace: '})[3]' }],
    tests: unit,
  },
  {
    name: 'the footer comes before the panels',
    edits: [
      {
        file: view,
        find: '...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]),',
        replace: '',
      },
      {
        file: view,
        find: '    h.div(\n      builders.panels.attrs(),',
        replace:
          '    ...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]),\n    h.div(\n      builders.panels.attrs(),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a configured frame drops its layers',
    edits: [
      {
        file: view,
        find: 'view: (options, h) => view(layered(config, options), h),',
        replace: 'view: (options, h) => view(options, h),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the outline variant draws no line',
    edits: [
      {
        file: recipe,
        find: 'root: variant(Style.self({ border: `${ref.border.thin} solid ${ref.outline.subtle}` })),',
        replace: 'root: variant(Style.self({})),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a panel has no hairline',
    edits: [
      {
        file: recipe,
        find: '        border: `${ref.border.thin} solid ${ref.outline.subtle}`,\n      }),\n    ),\n    footer',
        replace: '      }),\n    ),\n    footer',
      },
    ],
    tests: unit,
  },
  {
    name: 'the tray pad is not the gap between panels',
    edits: [
      {
        file: recipe,
        find: "panels: component(Style.self({ display: 'grid', gap: pad, minInlineSize: '0' })),",
        replace:
          "panels: component(Style.self({ display: 'grid', gap: '0', minInlineSize: '0' })),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a panel is as sharp as the tray',
    edits: [
      {
        file: recipe,
        find: 'borderRadius: `max(${ref.radius.sm}, calc(${corner} - ${pad}))`,',
        replace: 'borderRadius: corner,',
      },
    ],
    tests: unit,
  },
]
