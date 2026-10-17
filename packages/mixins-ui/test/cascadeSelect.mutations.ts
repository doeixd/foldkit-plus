/**
 * The cascade select, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/cascadeSelect.mutations.ts` checks
 * that a test fails for every one.
 */
const file = '../src/cascadeSelect.ts'
const recipe = '../src/recipes/cascadeSelect.ts'
const unit = 'packages/mixins-ui/test/cascadeSelect.test.ts'
const browser = 'packages/mixins-ui/test/cascadeSelect.browser.test.ts'

export default [
  {
    name: 'the keys land on a disabled option',
    edits: [{ file, find: 'if (enabled(rows[place]!)) return place', replace: 'return place' }],
    tests: [unit],
  },
  {
    name: 'a level wraps without loop',
    edits: [
      {
        file,
        find: 'if (config.loop !== true && (raw < 0 || raw >= rows.length)) return at',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a letter is matched by case',
    edits: [
      {
        file,
        find: 'row.label.toLocaleLowerCase().startsWith(letter)',
        replace: 'row.label.startsWith(key)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'ArrowLeft leaves the roots',
    edits: [
      { file, find: 'path.length > 1 ? highlight(', replace: 'path.length > 0 ? highlight(' },
    ],
    tests: [unit],
  },
  {
    name: 'Enter on a branch goes in when parents may be chosen',
    edits: [
      {
        file,
        find: 'hasChildren(active) && !choosesParents',
        replace: 'hasChildren(active)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a choice always closes',
    edits: [
      {
        file,
        find: 'return closeOnSelect ? closed(chosen, true)',
        replace: 'return true ? closed(chosen, true)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Escape leaves focus in the closed panel',
    edits: [
      {
        file,
        find: "case 'Escape':\n        return closed(model, true)",
        replace: "case 'Escape':\n        return closed(model, false)",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'focus leaving takes it back to the trigger',
    edits: [
      {
        file,
        find: 'Left: () => closed(model, false)',
        replace: 'Left: () => closed(model, true)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'opening forgets the value',
    edits: [
      {
        file,
        find: 'onSome: path =>\n        nodesOn(nodes, path).length === path.length ? Option.some(path) : Option.none(),',
        replace: 'onSome: () => Option.none<ReadonlyArray<string>>(),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the keys scroll nothing into view',
    edits: [{ file, find: '    return reveal\n', replace: '    return false\n' }],
    tests: [unit],
  },
  {
    name: 'the panel reads the arrows physically right to left',
    edits: [
      {
        file,
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the active row is not named',
    edits: [
      {
        file,
        find: 'onSome: active => [h.AriaActiveDescendant(active)]',
        replace: 'onSome: () => []',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an open branch owns no column',
    edits: [
      {
        file,
        find: '...(expanded ? [h.AriaOwns(columnId(id, depth + 1))] : []),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'hover opens nothing',
    edits: [{ file, find: "options.expandOn === 'hover'", replace: 'false' }],
    tests: [unit],
  },
  {
    name: 'drilled in, a branch opens beside instead of in',
    edits: [{ file, find: 'drill && branch\n', replace: 'false\n' }],
    tests: [unit],
  },
  {
    name: 'a select draws without a name',
    edits: [
      {
        file,
        find: "if (options.label.trim() === '')",
        replace: 'if (false)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a disabled select is drawn enabled',
    edits: [
      {
        file,
        find: 'const disabled = options.disabled === true',
        replace: 'const disabled = false',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the layer is no top-layer box',
    edits: [{ file, find: '...layerBox(h),', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the anchor cannot place the panel',
    edits: [{ file, find: "h.Style({ position: 'absolute' }),", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the placed panel takes no focus',
    edits: [{ file, find: 'focusAfterPosition: true,', replace: 'focusAfterPosition: false,' }],
    tests: [browser],
  },
  {
    name: 'the trigger is not focused again',
    edits: [{ file, find: 'document.getElementById(triggerId(id))?.focus()', replace: '' }],
    tests: [browser],
  },
  {
    name: 'focus leaving keeps the panel open',
    edits: [{ file, find: 'h.OnFocusLeave(send(Message.Left())),', replace: '' }],
    tests: [browser],
  },
  {
    name: 'a press outside reaches what is beneath',
    edits: [
      {
        file,
        find: "h.Style({ position: 'fixed', inset: '0' })]",
        replace: "h.Style({ display: 'none' })]",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the active row is not marked',
    edits: [{ file, find: "...(isActive ? [h.DataAttribute('active', '')] : []),", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the columns stack',
    edits: [
      {
        file: recipe,
        find: `display: 'flex',
        alignItems: 'stretch',`,
        replace: `display: 'block',
        alignItems: 'stretch',`,
      },
    ],
    tests: [browser],
  },
  {
    name: 'columns too wide for the window never drill in',
    edits: [
      {
        file,
        find: 'cramped: levels * widest > document.documentElement.clientWidth - margins,',
        replace: 'cramped: false,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the view ignores the measure',
    edits: [
      {
        file,
        find: "const drill = options.layout === 'drill' || model.cramped",
        replace: "const drill = options.layout === 'drill'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the panel may be wider than the window',
    edits: [
      { file: recipe, find: 'maxInlineSize: `calc(100vw - 2 * ${ref.space.xs})`,', replace: '' },
    ],
    tests: [browser],
  },
  {
    name: 'an unchanged measure makes a new Model',
    edits: [{ file, find: 'cramped === model.cramped', replace: 'false' }],
    tests: [unit],
  },
]
