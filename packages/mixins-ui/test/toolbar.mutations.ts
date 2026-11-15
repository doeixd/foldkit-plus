/**
 * The toolbar, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/toolbar.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/toolbar.test.ts'
const browser = 'packages/mixins-ui/test/toolbar.browser.test.ts'
const ssr = 'packages/mixins-ui/test/toolbar.ssr.test.ts'
const source = '../src/toolbar.ts'
const recipe = '../src/recipes/toolbar.ts'

export default [
  {
    name: 'the toolbar has no role',
    edits: [{ file: source, find: "h.Role('toolbar'),", replace: '' }],
    tests: [unit, ssr],
  },
  {
    name: 'the toolbar has no name',
    edits: [
      {
        file: source,
        find: 'h.AriaLabel(options.label),\n      h.AriaOrientation',
        replace: 'h.AriaOrientation',
      },
    ],
    tests: [unit, ssr],
  },
  {
    name: 'the toolbar says it runs the same way whatever the orientation',
    edits: [
      {
        file: source,
        find: 'h.AriaOrientation(orientation),',
        replace: "h.AriaOrientation('horizontal'),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'every control is a tab stop',
    edits: [{ file: source, find: 'h.Tabindex(at === stop ? 0 : -1),', replace: 'h.Tabindex(0),' }],
    tests: [unit, ssr, browser],
  },
  {
    name: 'the tab stop is always the first control',
    edits: [
      {
        file: source,
        find: 'RovingTabindex.tabStop(items, options.roving.current)',
        replace: 'RovingTabindex.tabStop(items, null)',
      },
    ],
    tests: [unit, ssr, browser],
  },
  {
    name: 'a control reports no focus, so the stop never follows a press',
    edits: [{ file: source, find: 'h.OnFocus(options.onFocus(control.id)),', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the arrows of the other orientation move too',
    edits: [
      {
        file: source,
        find: '...RovingTabindex.arrowChords(orientation),',
        replace: "...RovingTabindex.arrowChords('both'),",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'Home and End are not taken',
    edits: [
      {
        file: source,
        find: "...Behaviors.Keys.withShift('Home'),\n      ...Behaviors.Keys.withShift('End'),",
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a disabled control can be moved to',
    edits: [
      {
        file: source,
        find: 'disabled: each => each.disabled,',
        replace: 'disabled: () => false,',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a disabled group leaves its controls on',
    edits: [
      {
        file: source,
        find: 'disabled: off || item.disabled === true || control.disabled === true,',
        replace: 'disabled: off || control.disabled === true,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the direction is ignored',
    edits: [
      {
        file: source,
        find: 'orientation,\n          loop: options.loop ?? true,\n          direction,',
        replace: "orientation,\n          loop: options.loop ?? true,\n          direction: 'ltr',",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the arrows always wrap',
    edits: [{ file: source, find: 'loop: options.loop ?? true,', replace: 'loop: true,' }],
    tests: [unit, browser],
  },
  {
    name: 'a disabled toolbar still takes keys',
    edits: [{ file: source, find: '...(off ? [] : [keys.mixin]),', replace: '...[keys.mixin],' }],
    tests: [unit],
  },
  {
    name: 'a text field gives up its caret keys',
    edits: [
      {
        file: source,
        find: 'if (focused !== -1 && active !== null && usedBy(active, key, direction)) {',
        replace: 'if (false) {',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the arrows leave a text field whatever the caret',
    edits: [
      {
        file: source,
        find: 'return backward ? start > 0 : end < value.length',
        replace: 'return false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a selection does not keep the arrows',
    edits: [{ file: source, find: 'if (start !== end) return true', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the caret keys are read the same way under right-to-left',
    edits: [
      {
        file: source,
        find: "const backward = key === (direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft')",
        replace: "const backward = key === 'ArrowLeft'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a select gives up its keys',
    edits: [
      {
        file: source,
        find: 'if (element instanceof HTMLSelectElement) return true',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'Home and End leave a text field',
    edits: [
      {
        file: source,
        find: 'return !(element instanceof HTMLInputElement && element.selectionStart === null)',
        replace: 'return false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a press that starts outside the toolbar is taken',
    edits: [
      {
        file: source,
        find: 'if (active !== null && active !== document.body && focused === -1) return Option.none()',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the application keys are dropped',
    edits: [{ file: source, find: '...(options.routes ?? []),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'the separator keeps the toolbar orientation',
    edits: [
      {
        file: source,
        find: "const across = orientation === 'horizontal' ? 'vertical' : 'horizontal'",
        replace: 'const across = orientation',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a group is not named',
    edits: [{ file: source, find: 'h.AriaLabel(item.label),', replace: '' }],
    tests: [unit],
  },
  {
    name: 'a vertical toolbar is still a row',
    edits: [
      {
        file: recipe,
        find: "Style.nest(vertical, { flexDirection: 'column', alignItems: 'stretch' }),\n    ),\n    group",
        replace: '),\n    group',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the toolbar size steps nothing',
    edits: [{ file: recipe, find: 'sm: { root: steps.sm },', replace: 'sm: { root: steps.md },' }],
    tests: [browser],
  },
  {
    name: 'a horizontal separator is not a rule',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(\'&[data-orientation="horizontal"]\', {',
        replace: 'Style.nest(\'&[data-orientation="none"]\', {',
      },
    ],
    tests: [browser],
  },
]
