/**
 * Every view drawn inert: each element a Slot draws, no inline declaration the
 * theme cannot reach, and no token read that nothing defines.
 */
import { Option } from 'effect'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { initial as listInitial, type Message as ListMessage } from '../src/list/app.js'
import { EditableList, Leaves, ListSlots } from '../src/list/view.js'
import { initialOf as popupInitial } from '../src/popup/app.js'
import { ChoicePopup } from '../src/popup/view.js'
import { initial as saveInitial } from '../src/save/app.js'
import { SaveEditor } from '../src/save/view.js'
import { initialOf as searchInitial } from '../src/search/app.js'
import { ExplicitSearchField } from '../src/search/explicit.js'
import { itemsOf as resultsOf } from '../src/search/slots.js'
import { CompactSearchField, SearchField } from '../src/search/view.js'
import { initial as sortableInitial } from '../src/sortable/app.js'
import { SortableListbox, itemsOf as rowsOf } from '../src/sortable/view.js'
import { pageStylesheet } from '../src/style.js'
import { initial as boxInitial } from '../src/box/app.js'
import { MovableBox } from '../src/box/view.js'
import { initial as gridInitial } from '../src/grid/app.js'
import { FileGrid } from '../src/grid/view.js'
import { initialOf as hotkeysInitial } from '../src/hotkeys/app.js'
import { editorView } from '../src/hotkeys/view.js'
import { initial as inlineInitial } from '../src/inline-edit/app.js'
import { EditableTitles } from '../src/inline-edit/view.js'
import { initial as spatialInitial } from '../src/spatial/app.js'
import { SelectableBoard } from '../src/spatial/view.js'
import { initial as stepperInitial } from '../src/stepper/app.js'
import { NumberStepper } from '../src/stepper/view.js'
import { initial as swipeInitial } from '../src/swipe/app.js'
import { SwipeRow } from '../src/swipe/view.js'

const typed = { ...searchInitial('s').model, query: 'ap' }
const open = { ...popupInitial('p').model, open: true }

const drawn = [
  ['the search field', Inert.draw(SearchField, typed)],
  ['the compact search field', Inert.draw(CompactSearchField, typed)],
  ['the search field without the binder', Inert.draw(ExplicitSearchField, typed)],
  ['the list', Inert.draw(EditableList, listInitial().model)],
  ['a shut popup', Inert.draw(ChoicePopup, popupInitial('p').model)],
  ['an open popup', Inert.draw(ChoicePopup, open)],
  ['the sortable listbox', Inert.draw(SortableListbox, sortableInitial().model)],
  ['the editor', Inert.draw(SaveEditor, saveInitial().model)],
  ['the inline-edit titles', Inert.draw(EditableTitles, inlineInitial().model)],
  ['the spatial board', Inert.draw(SelectableBoard, spatialInitial().model)],
  ['the box', Inert.draw(MovableBox, boxInitial().model)],
  ['the stepper', Inert.draw(NumberStepper, stepperInitial().model)],
  ['the swipe row', Inert.draw(SwipeRow, swipeInitial().model)],
  ['the file grid', Inert.draw(FileGrid, gridInitial().model)],
  [
    'the hotkeys editor',
    Inert.draw(
      editorView(() => 0),
      hotkeysInitial('windows').model,
    ),
  ],
] as const

describe('every section drawn inert', () => {
  it.each(drawn)('%s draws only Slots, and reads no token that is missing', (_name, tree) => {
    // The live regions are LiveAnnounce's own markup, inside the `live` Slot.
    expect(Inert.unslotted(tree, { inside: ['live'] })).toEqual([])
    expect(Inert.fixedInline(tree)).toEqual([])
    expect(Inert.missingTokens(tree, pageStylesheet)).toEqual([])
    // A tree whose Styles read no token would pass the second check for nothing.
    expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
  })

  it('draws the bound and the unbound search field alike: the same classes and roles', () => {
    const [bound, unbound] = [SearchField, ExplicitSearchField].map(view => Inert.draw(view, typed))
    expect(Inert.css(Inert.all(unbound!))).toBe(Inert.css(Inert.all(bound!)))
    expect(Inert.byRole(unbound!, 'option')).toHaveLength(Inert.byRole(bound!, 'option').length)
  })

  it('names the roles a person and an agent find them by', () => {
    expect(Inert.byRole(Inert.draw(SearchField, typed), 'combobox')).toHaveLength(1)
    expect(Inert.byRole(Inert.draw(SearchField, typed), 'option')).toHaveLength(2)
    expect(Inert.byRole(Inert.draw(ChoicePopup, open), 'option')).toHaveLength(4)
    expect(
      Inert.byRole(Inert.draw(SortableListbox, sortableInitial().model), 'option'),
    ).toHaveLength(4)
  })

  it('draws the picked result, and the first option of a popup with no state of its own', () => {
    const picked = { ...typed, picked: Option.some('apple') }
    expect(Inert.byRole(Inert.draw(SearchField, picked), 'option')).toHaveLength(0)
  })
})

describe('a row drawn without its id', () => {
  it('is a defect the Presence Behavior names, not a phase it guesses', () => {
    const builders = SlotView.buildersFor(ListSlots, [Leaves.mixin], {
      input: listInitial().model,
      h: SlotView.inertBuilder<ListMessage>(),
    })
    expect(() => builders.row.attrs([], { index: 0 })).toThrow(/a row is drawn without its id/)
  })
})

describe('the Collection every option asks for', () => {
  it('is built once per Model, not once per option', () => {
    const sortable = sortableInitial().model
    expect(rowsOf(sortable)).toBe(rowsOf(sortable))
    expect(resultsOf(typed)).toBe(resultsOf(typed))
    expect(resultsOf({ ...typed })).not.toBe(resultsOf(typed))
  })
})
