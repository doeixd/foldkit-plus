import { Array, Option } from 'effect'
import { Submodel } from 'foldkit'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'

import { Listbox } from '@foldkit/ui'
import type { AnchorConfig } from '@foldkit/ui/listbox'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import * as Icon from '../../icon.js'
import { Message as UiMessage } from '../message.js'
import type { ListboxItem, UiModel } from '../model.js'
import { ListboxPageSlots, ListboxPageStyle } from '../style/listbox.js'

const LISTBOX_ITEMS: ReadonlyArray<ListboxItem> = [
  'Michael Bluth',
  'Lindsay Funke',
  'Gob Bluth',
  'George Michael',
  'Maeby Funke',
  'Buster Bluth',
  'Tobias Funke',
  'Lucille Bluth',
]

type Character = Readonly<{
  firstName: string
  lastName: string
}>

export const ItemListbox = Listbox.create<ListboxItem>()
export const ItemMultiListbox = Listbox.Multi.create<ListboxItem>()
export const CharacterListbox = Listbox.create<Character>()

const characterName = (character: Character): string =>
  `${character.firstName} ${character.lastName}`

const GROUPED_CHARACTERS: ReadonlyArray<Character> = [
  { firstName: 'Michael', lastName: 'Bluth' },
  { firstName: 'Gob', lastName: 'Bluth' },
  { firstName: 'George Michael', lastName: 'Bluth' },
  { firstName: 'Buster', lastName: 'Bluth' },
  { firstName: 'Lucille', lastName: 'Bluth' },
  { firstName: 'Lindsay', lastName: 'Funke' },
  { firstName: 'Maeby', lastName: 'Funke' },
  { firstName: 'Tobias', lastName: 'Funke' },
]

const LISTBOX_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
}

type Slots = SlotBuilders<typeof ListboxPageSlots, UiMessage>

// PIECES

/** The check shows while the option is `data-selected`, which its Style reads. */
const itemContent = (label: string, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.itemContent.attrs(), [
    Icon.check(slots.checkIcon.attrs(), h),
    h.span(slots.itemLabel.attrs(), [label]),
  ])

const buttonContent = (label: string, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.buttonContent.attrs(), [
    h.span(slots.buttonLabel.attrs(), [label]),
    Icon.chevronDown(slots.chevron.attrs(), h),
  ])

const chromeAttributes = (slots: Slots) => ({
  buttonAttributes: childAttributes(slots.button.attrs()),
  itemsAttributes: childAttributes(slots.items.attrs()),
  backdropAttributes: childAttributes(slots.backdrop.attrs()),
  attributes: childAttributes(slots.listbox.attrs()),
})

const field = (
  buttonId: string,
  label: string,
  listbox: Html,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html =>
  h.div(slots.field.attrs(), [
    h.label(slots.label.attrs([h.For(buttonId)]), [label]),
    h.div(slots.anchor.attrs(), [listbox]),
  ])

// DEMOS

const singleSelectDemo = (
  listboxModel: Listbox.Model,
  maybeSelectedItem: Option.Option<ListboxItem>,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const buttonLabel = Option.getOrElse(maybeSelectedItem, () => 'Select a Bluth')

  return field(
    Listbox.buttonId(listboxModel.id),
    'Family member',
    h.submodel({
      slotId: 'listbox-single',
      model: listboxModel,
      view: ItemListbox.view,
      viewInputs: {
        anchor: LISTBOX_ANCHOR,
        items: LISTBOX_ITEMS,
        maybeSelectedValue: maybeSelectedItem,
        itemToConfig: item => ({ content: itemContent(item, slots, h) }),
        buttonContent: buttonContent(buttonLabel, slots, h),
        ...chromeAttributes(slots),
      },
      toParentMessage: message => UiMessage.GotListboxDemoMessage({ message }),
    }),
    slots,
    h,
  )
}

const multiSelectDemo = (
  listboxModel: Listbox.Multi.Model,
  selectedItems: ReadonlyArray<ListboxItem>,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const buttonLabel = Array.match(selectedItems, {
    onEmpty: () => 'Select Bluths',
    onNonEmpty: items =>
      items.length === 1 ? Array.headNonEmpty(items) : `${items.length} selected`,
  })

  return field(
    Listbox.Multi.buttonId(listboxModel.id),
    'Family members',
    h.submodel({
      slotId: 'listbox-multi',
      model: listboxModel,
      view: ItemMultiListbox.view,
      viewInputs: {
        anchor: LISTBOX_ANCHOR,
        items: LISTBOX_ITEMS,
        selectedValues: selectedItems,
        itemToConfig: item => ({ content: itemContent(item, slots, h) }),
        buttonContent: buttonContent(buttonLabel, slots, h),
        ...chromeAttributes(slots),
      },
      toParentMessage: message => UiMessage.GotListboxMultiDemoMessage({ message }),
    }),
    slots,
    h,
  )
}

const groupedDemo = (
  listboxModel: Listbox.Model,
  maybeSelectedItem: Option.Option<string>,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const buttonLabel = Option.getOrElse(maybeSelectedItem, () => 'Select a character')

  return field(
    Listbox.buttonId(listboxModel.id),
    'Character',
    h.submodel({
      slotId: 'listbox-grouped',
      model: listboxModel,
      view: CharacterListbox.view,
      viewInputs: {
        anchor: LISTBOX_ANCHOR,
        items: GROUPED_CHARACTERS,
        maybeSelectedValue: maybeSelectedItem,
        itemToValue: characterName,
        itemGroupKey: character => character.lastName,
        groupToHeading: lastName => ({
          content: h.span(slots.groupHeading.attrs(), [`${lastName}s`]),
        }),
        separatorAttributes: childAttributes(slots.separator.attrs()),
        itemToConfig: character => ({ content: itemContent(characterName(character), slots, h) }),
        buttonContent: buttonContent(buttonLabel, slots, h),
        ...chromeAttributes(slots),
      },
      toParentMessage: message => UiMessage.GotListboxGroupedDemoMessage({ message }),
    }),
    slots,
    h,
  )
}

// VIEW

const ListboxPage = SlotView.forMessages<UiMessage>()
  .define(ListboxPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Listbox']),

      h.h3(slots.section.attrs(), ['Single-Select']),
      singleSelectDemo(model.listboxDemo, model.maybeListboxDemoSelectedItem, slots, h),

      h.h3(slots.section.attrs(), ['Multi-Select']),
      multiSelectDemo(model.listboxMultiDemo, model.listboxMultiDemoSelectedItems, slots, h),

      h.h3(slots.section.attrs(), ['Grouped']),
      groupedDemo(model.listboxGroupedDemo, model.maybeListboxGroupedDemoSelectedItem, slots, h),
    ]),
  )
  .pipe(Style.attach(ListboxPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(ListboxPage)
