/**
 * The filters beside All Results: the TLD (a Listbox with typeahead over the
 * catalog on a desktop, a searchable Sheet on a phone), and availability and
 * sort (each a `Picker`: a dropdown on a desktop, a Sheet on a phone). The
 * Model keeps each value; these draw the controls that change it.
 */
import { Array, Option, String, pipe } from 'effect'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { Icon } from 'foldkit-media'
import type { SlotBuilders } from 'foldkit-mixins'
import { Listbox, Picker, Sheet } from 'foldkit-mixins-ui'
import { type Model, TldDropdown } from './app.js'
import { AvailabilityFilter, SortOrder, TldFilter } from './domain'
import { icons } from './iconData.js'
import { Message } from './message.js'
import { ListboxStyle, type Page, PickerStyle, SheetLook, SheetStyle } from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

export const TLD_FILTER_BUTTON_ID = 'mobile-tld-filter'

const availabilityLabels: Readonly<Record<AvailabilityFilter, string>> = {
  All: 'Show All',
  Available: 'Available',
}

const sortLabels: Readonly<Record<SortOrder, string>> = {
  Relevance: 'Relevance',
  Length: 'Length',
  Alphabetical: 'Alphabetical',
  PriceAscending: 'Price: Low to High',
  PriceDescending: 'Price: High to Low',
}

export const tldLabel = (value: TldFilter): string =>
  value === 'All' ? 'All TLDs' : `.${String.toLowerCase(value)}`

/** The TLDs a phone's search matches, `All` first and the rest in order, as upstream. */
const visibleTlds = (query: string): ReadonlyArray<TldFilter> => {
  const search = pipe(query, String.trim, String.toLowerCase, String.replace(/^\./, ''))
  const extensions = pipe(
    TldFilter.literals,
    Array.filter(value => value !== 'All'),
    Array.sort(String.Order),
  )
  return Array.filter<TldFilter>(['All', ...extensions], value =>
    pipe(tldLabel(value), String.toLowerCase, String.includes(search)),
  )
}

const desktopTld = (model: Model, slots: Slots, h: H): Html => {
  const parts = Listbox.parts([ListboxStyle.mixin], { h })
  return h.div(slots.desktopTld.attrs(), [
    h.submodel({
      slotId: model.tldListbox.id,
      model: model.tldListbox,
      view: TldDropdown.view,
      viewInputs: {
        anchor: { placement: 'bottom-end', gap: 6, padding: 8, portal: false },
        items: TldFilter.literals,
        itemToValue: value => value,
        itemToSearchText: value => (value === 'All' ? tldLabel(value) : String.toLowerCase(value)),
        maybeSelectedValue: Option.some(model.tldFilter),
        ariaLabel: `Filter by TLD: ${tldLabel(model.tldFilter)}`,
        itemToConfig: value => ({ content: parts.option({ label: tldLabel(value) }) }),
        buttonContent: parts.trigger(
          Option.some({ label: tldLabel(model.tldFilter) }),
          tldLabel(model.tldFilter),
        ),
        toView: Listbox.toView([ListboxStyle.mixin], { h }),
        // The 557 rows scroll: the panel takes focus so the keys can reach them, as upstream's.
        itemsAttributes: childAttributes([h.Tabindex(0)]),
      },
      toParentMessage: message => Message.GotTldListboxMessage({ message }),
    }),
  ])
}

const choiceContent = (label: string, slots: Slots, h: H): ReadonlyArray<Html> => [
  h.span([], [label]),
  h.span(slots.choiceCheck.attrs([h.AriaHidden(true)]), [
    Icon.draw(icons.check, h, { size: '20px' }),
  ]),
]

const tldSheet = (model: Model, slots: Slots, h: H): Html =>
  Sheet.view(
    {
      model: model.tldSheet,
      onMessage: message => Message.GotTldSheetMessage({ message }),
      mixins: [SheetStyle.mixin, SheetLook.mixin],
      draw: sheet =>
        h.dialog(
          sheet.dialog,
          sheet.isVisible
            ? [
                h.div(sheet.backdrop),
                // The panel is the Sheet's Slot; the page's own layout sits inside it,
                // since two Slots on one element keep one class.
                h.section(sheet.panel, [
                  h.div(sheet.handle),
                  h.h2(sheet.title, ['Filter by TLD']),
                  h.div(slots.tldPanel.attrs(), [
                    h.div(slots.tldSearch.attrs(), [
                      Icon.draw(icons.search, h, { size: '20px' }),
                      h.input(
                        slots.tldSearchInput.attrs([
                          ...sheet.initialFocus,
                          h.Type('search'),
                          h.AriaLabel('Search TLDs'),
                          h.Placeholder('Search TLDs...'),
                          h.Autocomplete('off'),
                          h.Value(model.tldSearchQuery),
                          h.OnInput(value => Message.UpdatedTldSearch({ value })),
                        ]),
                      ),
                    ]),
                    h.div(
                      slots.tldOptions.attrs(),
                      Array.match(visibleTlds(model.tldSearchQuery), {
                        onEmpty: () => [
                          h.p(slots.tldNoResults.attrs([h.Role('status')]), ['No TLDs found.']),
                        ],
                        onNonEmpty: values =>
                          Array.map(values, value =>
                            h.keyed('button')(
                              value,
                              slots.choice.attrs([
                                h.Type('button'),
                                h.AriaPressed(value === model.tldFilter ? 'true' : 'false'),
                                h.OnClick(Message.ClickedMobileTldOption({ value })),
                              ]),
                              choiceContent(tldLabel(value), slots, h),
                            ),
                          ),
                      }),
                    ),
                  ]),
                  h.button(
                    [...sheet.closeButton, h.AriaLabel('Close TLD filter')],
                    [Icon.draw(icons.close, h, { size: '18px' })],
                  ),
                ]),
              ]
            : [],
        ),
    },
    h,
  )

const picker = <Value extends string>(
  config: {
    readonly model: Picker.Model
    readonly onMessage: (message: Picker.Message) => Message
    readonly label: string
    readonly values: ReadonlyArray<Value>
    readonly labels: Readonly<Record<Value, string>>
    readonly value: Value
  },
  h: H,
): Html =>
  Picker.view(
    {
      model: config.model,
      onMessage: config.onMessage,
      label: config.label,
      options: Array.map(config.values, value => ({ value, label: config.labels[value] })),
      value: Option.some(config.value),
      placeholder: config.labels[config.value],
      anchor: { placement: 'bottom-end', gap: 6, padding: 8, portal: false },
      style: PickerStyle,
      listbox: [ListboxStyle.mixin],
      sheet: [SheetStyle.mixin, SheetLook.mixin],
    },
    h,
  )

export const filters = (model: Model, slots: Slots, h: H): Html =>
  h.div(slots.filters.attrs(), [
    desktopTld(model, slots, h),
    h.button(
      slots.mobileTld.attrs([
        h.Id(TLD_FILTER_BUTTON_ID),
        h.Type('button'),
        h.AriaLabel(`Filter by TLD: ${tldLabel(model.tldFilter)}`),
        h.AriaHasPopup('dialog'),
        h.AriaExpanded(Sheet.isOpen(model.tldSheet)),
        h.OnClick(Message.ClickedTldFilter()),
      ]),
      [h.span([], [tldLabel(model.tldFilter)]), Icon.draw(icons.chevronDown, h, { size: '14px' })],
    ),
    tldSheet(model, slots, h),
    picker(
      {
        model: model.availabilityPicker,
        onMessage: message => Message.GotAvailabilityPickerMessage({ message }),
        label: 'Filter availability',
        values: AvailabilityFilter.literals,
        labels: availabilityLabels,
        value: model.availabilityFilter,
      },
      h,
    ),
    picker(
      {
        model: model.sortPicker,
        onMessage: message => Message.GotSortPickerMessage({ message }),
        label: 'Sort results',
        values: SortOrder.literals,
        labels: sortLabels,
        value: model.sortOrder,
      },
      h,
    ),
  ])
