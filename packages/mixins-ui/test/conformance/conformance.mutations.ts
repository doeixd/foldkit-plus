/**
 * Each Conformance scenario's assertions, broken in turn in a widget:
 * `pnpm mutate packages/mixins-ui/test/conformance/conformance.mutations.ts`.
 * Upstream (`@foldkit/ui`) owns the roles and keys of the shipped Checkbox,
 * Tabs and Dialog, and Vite bundles it before a mutation can reach it, so those
 * assertions are killed by a mutation of the primitive or of the view assembled
 * from primitives that the same scenario runs over. The shipped Listbox and
 * TreeView are mixins-ui's own markup and are mutated directly.
 */
const dir = 'packages/mixins-ui/test/conformance/'
const listbox = [`${dir}listbox.browser.test.ts`]
const checkbox = [`${dir}checkbox.browser.test.ts`]
const tabs = [`${dir}tabs.browser.test.ts`]
const tree = [`${dir}tree.browser.test.ts`]
const dialog = [`${dir}dialog.browser.test.ts`]

const shared = '../../src/listboxShared.ts'
const handListbox = './listbox.handBuilt.ts'
const handTabs = './tabs.handBuilt.ts'
const handTree = './tree.handBuilt.ts'
const handCheckbox = './checkbox.handBuilt.ts'
const handDialog = './dialog.handBuilt.ts'
const roving = '../../../primitives/src/interaction/roving-tabindex.ts'
const selection = '../../../primitives/src/interaction/selection.ts'
const press = '../../../primitives/src/interaction/press.ts'
const toggle = '../../../mixins/src/behaviors/toggle-state.ts'
const treeNav = '../../../primitives/src/interaction/tree-navigation.ts'
const focusScope = '../../../primitives/src/dom/focus-scope.ts'
const dismiss = '../../../primitives/src/interaction/dismiss-layer.ts'
const overlay = '../../../primitives/src/interaction/overlay.ts'

const edit = (file: string, find: string, replace: string) => ({ file, find, replace })

export default [
  // Listbox
  {
    name: 'the listbox draws no role',
    edits: [edit(shared, "h.Role('listbox'),", '')],
    tests: listbox,
  },
  {
    name: 'the listbox has no name',
    edits: [edit(shared, 'h.AriaLabelledBy(`${id}-button`),', '')],
    tests: listbox,
  },
  {
    name: 'an option draws no role',
    edits: [edit(shared, "h.Role('option'),", '')],
    tests: listbox,
  },
  {
    name: 'an option says nothing of being selected',
    edits: [edit(shared, 'h.AriaSelected(isSelectedItem),', '')],
    tests: listbox,
  },
  {
    name: 'the arrows are read physically under right to left',
    edits: [
      edit(
        shared,
        'h.OnKeyDownPreventDefault(key => handleItemsKeyDown(readingKey(key, direction))),',
        'h.OnKeyDownPreventDefault(handleItemsKeyDown),',
      ),
    ],
    tests: listbox,
  },
  {
    name: 'a disabled option is activated by a press',
    edits: [
      edit(
        shared,
        'const isHoverable = !isDisabledItem && !isLeaving',
        'const isHoverable = !isLeaving',
      ),
    ],
    tests: listbox,
  },
  {
    name: 'a disabled option does not say it is disabled',
    edits: [
      edit(
        shared,
        "...(isDisabledItem ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')] : []),",
        '',
      ),
    ],
    tests: listbox,
  },
  {
    name: 'the assembled listbox draws no role',
    edits: [edit(handListbox, "h.Role('option'),", '')],
    tests: listbox,
  },
  {
    name: 'the assembled listbox has no name',
    edits: [edit(handListbox, ", h.AriaLabel('Frequency')", '')],
    tests: listbox,
  },
  {
    name: 'the assembled listbox treats a disabled option as enabled',
    edits: [
      edit(handListbox, 'disabled: option => option.disabled === true,', 'disabled: () => false,'),
    ],
    tests: listbox,
  },
  {
    name: 'Space does not activate an assembled option',
    edits: [
      edit(
        handListbox,
        "on: [Behaviors.Keys.chord('Enter'), Behaviors.Keys.chord(' ')],",
        "on: [Behaviors.Keys.chord('Enter')],",
      ),
    ],
    tests: listbox,
  },
  {
    name: 'Enter does not activate an assembled option',
    edits: [
      edit(
        handListbox,
        "on: [Behaviors.Keys.chord('Enter'), Behaviors.Keys.chord(' ')],",
        "on: [Behaviors.Keys.chord(' ')],",
      ),
    ],
    tests: listbox,
  },
  {
    name: 'the assembled listbox reads the arrows physically under right to left',
    edits: [edit(handListbox, 'direction: input => input.direction,', "direction: () => 'ltr',")],
    tests: listbox,
  },
  {
    name: 'Home goes to the last item',
    edits: [edit(roving, "if (key === 'Home') return first", "if (key === 'Home') return last")],
    tests: [...listbox, ...tabs],
  },
  {
    name: 'End goes to the first item',
    edits: [edit(roving, "if (key === 'End') return last", "if (key === 'End') return first")],
    tests: [...listbox, ...tabs],
  },
  {
    name: 'an arrow toward the start goes forward',
    edits: [
      edit(
        roving,
        '(horizontal && key === backwardKey)\n        ? -1',
        '(horizontal && key === backwardKey)\n        ? 1',
      ),
    ],
    tests: [...listbox, ...tabs],
  },
  {
    name: 'both arrows go forward',
    edits: [
      edit(
        roving,
        '(horizontal && key === forwardKey)',
        '(horizontal && (key === forwardKey || key === backwardKey))',
      ),
    ],
    tests: [...listbox, ...tabs],
  },
  {
    name: 'the roving arrows ignore the direction',
    edits: [
      edit(
        roving,
        "const forwardKey = options.direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'",
        "const forwardKey = 'ArrowRight'",
      ),
      edit(
        roving,
        "const backwardKey = options.direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'",
        "const backwardKey = 'ArrowLeft'",
      ),
    ],
    tests: [...listbox, ...tabs],
  },
  {
    name: 'Selection writes no aria-selected',
    edits: [edit(selection, 'h.AriaSelected(selectedOf(input).has(id)),', '')],
    tests: [...listbox, ...tabs],
  },
  {
    name: 'Selection activates a disabled item on a press',
    edits: [
      edit(
        selection,
        "options.click !== false && args.mode !== 'none' && !items.isDisabled(item.index)",
        "options.click !== false && args.mode !== 'none'",
      ),
    ],
    tests: [...listbox, ...tabs],
  },

  // Checkbox
  {
    name: 'the assembled checkbox draws no role',
    edits: [edit(handCheckbox, "h.Role('checkbox'),", '')],
    tests: checkbox,
  },
  {
    name: 'the assembled checkbox has no name',
    edits: [
      edit(
        handCheckbox,
        "h.AriaLabel(input.mine === 'isSubscribed' ? 'Subscribe' : 'Locked'),",
        '',
      ),
    ],
    tests: checkbox,
  },
  {
    name: 'a press does not toggle the assembled checkbox',
    edits: [
      edit(handCheckbox, 'isSubscribed: !model.isSubscribed', 'isSubscribed: model.isSubscribed'),
    ],
    tests: checkbox,
  },
  {
    name: 'a press only ever checks the assembled checkbox',
    edits: [edit(handCheckbox, 'isSubscribed: !model.isSubscribed', 'isSubscribed: true')],
    tests: checkbox,
  },
  {
    name: 'the checkbox reports no state',
    edits: [edit(toggle, '[h.AriaChecked(state)]', '[h.AriaChecked(false)]')],
    tests: checkbox,
  },
  {
    name: 'a disabled checkbox toggles',
    edits: [edit(handCheckbox, 'disabled: () => true', 'disabled: () => false')],
    tests: checkbox,
  },
  {
    name: 'a disabled checkbox does not say so',
    edits: [
      edit(press, '...(options.disabled?.(input) === true ? [h.AriaDisabled(true)] : []),', ''),
    ],
    tests: checkbox,
  },

  // Tabs
  {
    name: 'the assembled tab list draws no role',
    edits: [edit(handTabs, "h.Role('tablist'), ", '')],
    tests: tabs,
  },
  {
    name: 'the assembled tabs draw no role',
    edits: [edit(handTabs, "h.Role('tab'),", '')],
    tests: tabs,
  },
  {
    name: 'the assembled tab list has no name',
    edits: [edit(handTabs, ", h.AriaLabel('Project')", '')],
    tests: tabs,
  },
  {
    name: 'the selected assembled tab controls no panel',
    edits: [
      edit(handTabs, '...(tab.id === chosen ? [h.AriaControls(`${tab.id}-panel`)] : []),', ''),
    ],
    tests: tabs,
  },
  {
    name: 'the assembled panel is not named by its tab',
    edits: [edit(handTabs, 'h.AriaLabelledBy(tab.id),', '')],
    tests: tabs,
  },
  {
    name: 'the assembled tabs show every panel',
    edits: [edit(handTabs, '.filter(tab => tab.id === chosen)', '')],
    tests: tabs,
  },
  {
    name: 'no assembled tab starts selected',
    edits: [
      edit(
        handTabs,
        'selection: { selected: [tabs[0]!.id], anchor: tabs[0]!.id },',
        'selection: { selected: [], anchor: null },',
      ),
    ],
    tests: tabs,
  },
  {
    name: 'a tab that becomes current is not chosen',
    edits: [
      edit(
        handTabs,
        'return current === null || moved.value.model.selection.selected[0] === current',
        'return true',
      ),
    ],
    tests: tabs,
  },
  {
    name: 'the assembled tabs treat a disabled tab as enabled',
    edits: [edit(handTabs, 'disabled: tab => tab.disabled === true,', 'disabled: () => false,')],
    tests: tabs,
  },
  {
    name: 'the shipped tabs read the arrows physically under right to left',
    edits: [
      edit('../../src/tabs.ts', 'mount: () => ReadingKeys(),', 'mount: () => FollowDirection(),'),
    ],
    tests: tabs,
  },

  // Tree
  {
    name: 'the tree draws no role',
    edits: [edit('../../src/treeView.ts', "h.Role('tree'),", '')],
    tests: tree,
  },
  {
    name: 'the tree has no name',
    edits: [edit('../../src/treeView.ts', 'h.AriaLabel(options.label),', '')],
    tests: tree,
  },
  {
    name: 'a row draws no role',
    edits: [edit('../../src/treeView.ts', "h.Role('treeitem'),", '')],
    tests: tree,
  },
  {
    name: 'a parent row says nothing of being expanded',
    edits: [
      edit(
        '../../src/treeView.ts',
        '...(branch ? [h.AriaExpanded(shown), state] : []),',
        '...(branch ? [state] : []),',
      ),
    ],
    tests: tree,
  },
  {
    name: 'a shut parent still shows its children',
    edits: [edit('../../src/treeView.ts', "...(shown ? [] : [h.Attribute('inert', '')]),", '')],
    tests: tree,
  },
  {
    name: 'the shipped tree reads its arrows physically under right to left',
    edits: [
      edit(
        '../../src/treeView.ts',
        'const key = readingKey(pressed, options.direction)',
        'const key = pressed',
      ),
    ],
    tests: tree,
  },
  {
    name: 'the inward arrow on a shut parent does not open it',
    edits: [
      edit(
        treeNav,
        "if (!isOpen(model, args, row.id)) return { _tag: 'Open', id: row.id }",
        'if (!isOpen(model, args, row.id)) return undefined',
      ),
    ],
    tests: tree,
  },
  {
    name: 'the outward arrow on an open parent does not shut it',
    edits: [
      edit(
        treeNav,
        "if (row.branch && isOpen(model, args, row.id)) return { _tag: 'Close', id: row.id }",
        '',
      ),
    ],
    tests: tree,
  },
  {
    name: 'Home goes to the last row',
    edits: [
      edit(
        treeNav,
        "if (key === 'Home') return focus(enabled[0])",
        "if (key === 'Home') return focus(enabled[enabled.length - 1])",
      ),
    ],
    tests: tree,
  },
  {
    name: 'End goes to the first row',
    edits: [
      edit(
        treeNav,
        "if (key === 'End') return focus(enabled[enabled.length - 1])",
        "if (key === 'End') return focus(enabled[0])",
      ),
    ],
    tests: tree,
  },
  {
    name: 'ArrowDown skips a row',
    edits: [
      edit(
        treeNav,
        'enabled[Math.min(at + 1, enabled.length - 1)]',
        'enabled[Math.min(at + 2, enabled.length - 1)]',
      ),
    ],
    tests: tree,
  },
  {
    name: 'the tree reads its arrows physically under right to left',
    edits: [
      edit(
        treeNav,
        "const inward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'",
        "const inward = 'ArrowRight'",
      ),
    ],
    tests: tree,
  },
  {
    name: 'the assembled tree has no name',
    edits: [edit(handTree, "h.AriaLabel('Files'), ", '')],
    tests: tree,
  },
  {
    name: 'the assembled tree draws no row role',
    edits: [
      edit('../../../primitives/src/interaction/tree-navigation.ts', "h.Role('treeitem'),", ''),
    ],
    tests: tree,
  },
  {
    name: 'an assembled parent row says nothing of being expanded',
    edits: [
      edit(treeNav, '...(row.branch ? [h.AriaExpanded(isOpen(model, args, row.id))] : []),', ''),
    ],
    tests: tree,
  },

  // Dialog
  {
    name: 'the assembled dialog draws no role',
    edits: [edit(handDialog, "h.Role('dialog'), ", '')],
    tests: dialog,
  },
  {
    name: 'the assembled dialog has no name',
    edits: [edit(handDialog, 'h.AriaLabel(input.title), ', '')],
    tests: dialog,
  },
  {
    name: 'focus does not move into a dialog that opens',
    edits: [
      edit(
        focusScope,
        'else if (!focusFirst(tabbableWithin(element)) && element instanceof HTMLElement) {',
        'else if (false) {',
      ),
    ],
    tests: dialog,
  },
  {
    name: 'a dialog does not contain Tab',
    edits: [
      edit(
        focusScope,
        '          if (contain) {\n            element.addEventListener',
        '          if (false) {\n            element.addEventListener',
      ),
    ],
    tests: dialog,
  },
  {
    name: 'a dialog does not give focus back',
    edits: [
      edit(
        focusScope,
        'if (restore && previous instanceof HTMLElement',
        'if (false && previous instanceof HTMLElement',
      ),
    ],
    tests: dialog,
  },
  {
    name: 'Escape closes no layer',
    edits: [edit(dismiss, 'top !== undefined && top.escape', 'top !== undefined && false')],
    tests: dialog,
  },
  {
    name: 'Escape closes the bottom layer first',
    edits: [edit(dismiss, 'const top = layers[layers.length - 1]', 'const top = layers[0]')],
    tests: dialog,
  },
  {
    name: 'the modal policy does not restore focus',
    edits: [edit(overlay, 'restore: options.policy.focus.restore,', 'restore: false,')],
    tests: dialog,
  },
]
