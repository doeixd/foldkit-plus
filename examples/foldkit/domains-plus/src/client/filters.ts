/**
 * The filters beside All Results, drawn twice and shown by width, as
 * upstream's are: on a desktop three dropdowns (the TLD with typeahead over
 * the catalog, availability and sort); on a phone the TLD's searchable sheet
 * and one "Filters and sort" sheet holding availability and sort together.
 * The Model keeps each value; these draw the controls that change it.
 */
import type * as UiListbox from '@foldkit/ui/listbox'
import { Array, Option, String, pipe } from 'effect'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { Icon } from 'foldkit-media'
import type { SlotAttributes, SlotBuilders } from 'foldkit-mixins'
import { Listbox, type ListboxRenderInfo, Sheet } from 'foldkit-mixins-ui'
import { Dropdown, type Model } from './app.js'
import { FILTERS_BUTTON_ID, TLD_FILTER_BUTTON_ID } from './command.js'
import { AvailabilityFilter, SortOrder, TldFilter } from './domain'
import { icons } from './iconData.js'
import { Message } from './message.js'
import {
  FiltersSheetLook,
  ListboxLook,
  ListboxStyle,
  type Page,
  SheetLook,
  SheetStyle,
  TldSheetLook,
} from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

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

/** The phone's sorts, as upstream's: one "Price" stands for both price orders. */
const phoneSorts: ReadonlyArray<SortOrder> = [
  'Relevance',
  'Length',
  'PriceAscending',
  'Alphabetical',
]

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

/**
 * The TLD panel's 557 rows scroll inside it, so it is a tab stop of its own
 * (axe's scrollable-region-focusable), as upstream's. The Listbox's
 * `itemsAttributes` crash the page once drawn (#374), and a Behavior may not
 * own the Tabindex the Listbox sets, so the panel's own attributes take it
 * before its Slot resolves them; the later Tabindex wins.
 */
const withTabStop =
  (h: H, draw: (render: ListboxRenderInfo) => Html) =>
  (render: ListboxRenderInfo): Html =>
    draw(
      render.items === undefined
        ? render
        : {
            ...render,
            items: {
              ...render.items,
              attributes: [...render.items.attributes, ...childAttributes([h.Tabindex(0)])],
            },
          },
    )

/** A desktop dropdown over `values`, its trigger naming `label` and the value chosen. */
const dropdown = <Value extends string>(
  config: {
    readonly listbox: UiListbox.Model
    readonly onMessage: (message: UiListbox.Message) => Message
    readonly label: string
    readonly values: ReadonlyArray<Value>
    readonly labelOf: (value: Value) => string
    readonly value: Value
    /** What typeahead matches; the label by default. */
    readonly searchText?: (value: Value) => string
    readonly tabStop?: boolean
  },
  h: H,
): Html => {
  const mixins = [ListboxStyle.mixin, ListboxLook.mixin]
  const parts = Listbox.parts(mixins, { h })
  const searchText = config.searchText ?? config.labelOf
  const options = Array.map(config.values, value => ({
    value,
    label: config.labelOf(value),
    searchText: searchText(value),
  }))
  const chosen = config.labelOf(config.value)
  return h.submodel({
    slotId: config.listbox.id,
    model: config.listbox,
    view: Dropdown.view,
    viewInputs: {
      anchor: { placement: 'bottom-end', gap: 6, padding: 8, portal: false },
      items: options,
      itemToValue: option => option.value,
      itemToSearchText: option => option.searchText,
      maybeSelectedValue: Option.some(config.value),
      ariaLabel: `${config.label}: ${chosen}`,
      itemToConfig: option => ({ content: parts.option({ label: option.label }) }),
      buttonContent: parts.trigger(Option.some({ label: chosen }), chosen),
      toView:
        config.tabStop === true
          ? withTabStop(h, Listbox.toView(mixins, { h }))
          : Listbox.toView(mixins, { h }),
    },
    toParentMessage: config.onMessage,
  })
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
      mixins: [SheetStyle.mixin, SheetLook.mixin, TldSheetLook.mixin],
      draw: sheet =>
        h.dialog(
          sheet.dialog,
          sheet.isVisible
            ? [
                h.div(sheet.backdrop),
                h.section(sheet.panel, [
                  h.div(sheet.handle),
                  h.h2(sheet.title, ['Filter by TLD']),
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

/** A group of the phone's filters sheet: its heading, and a pressed button per choice. */
const choiceGroup = <Value extends string>(
  config: {
    readonly id: string
    readonly heading: string
    readonly values: ReadonlyArray<Value>
    readonly labelOf: (value: Value) => string
    readonly isChosen: (value: Value) => boolean
    readonly onChoose: (value: Value) => Message
    /** The Dialog's first focus, given to the chosen choice. */
    readonly initialFocus: SlotAttributes<Message>
  },
  slots: Slots,
  h: H,
): Html =>
  h.div(slots.filterGroup.attrs([h.Role('group'), h.AriaLabelledBy(config.id)]), [
    h.h3(slots.filterGroupLabel.attrs([h.Id(config.id)]), [config.heading]),
    ...Array.map(config.values, value =>
      h.keyed('button')(
        value,
        slots.choice.attrs([
          h.Type('button'),
          h.AriaPressed(config.isChosen(value) ? 'true' : 'false'),
          ...(config.isChosen(value) ? config.initialFocus : []),
          h.OnClick(config.onChoose(value)),
        ]),
        choiceContent(config.labelOf(value), slots, h),
      ),
    ),
  ])

const filtersSheet = (model: Model, slots: Slots, h: H): Html =>
  Sheet.view(
    {
      model: model.filtersSheet,
      onMessage: message => Message.GotFiltersSheetMessage({ message }),
      mixins: [SheetStyle.mixin, SheetLook.mixin, FiltersSheetLook.mixin],
      draw: sheet =>
        h.dialog(
          sheet.dialog,
          sheet.isVisible
            ? [
                h.div(sheet.backdrop),
                h.section(sheet.panel, [
                  h.div(sheet.handle),
                  h.h2(sheet.title, ['Filters and sort']),
                  choiceGroup(
                    {
                      id: 'availability-filter-heading',
                      heading: 'Filter by',
                      values: AvailabilityFilter.literals,
                      labelOf: value => availabilityLabels[value],
                      isChosen: value => value === model.availabilityFilter,
                      onChoose: value => Message.ClickedMobileAvailabilityOption({ value }),
                      initialFocus: sheet.initialFocus,
                    },
                    slots,
                    h,
                  ),
                  h.hr(slots.filterDivider.attrs()),
                  choiceGroup(
                    {
                      id: 'sort-order-heading',
                      heading: 'Sort by',
                      values: phoneSorts,
                      labelOf: value => (value === 'PriceAscending' ? 'Price' : sortLabels[value]),
                      isChosen: value =>
                        value === model.sortOrder ||
                        (value === 'PriceAscending' && model.sortOrder === 'PriceDescending'),
                      onChoose: value => Message.ClickedMobileSortOption({ value }),
                      initialFocus: [],
                    },
                    slots,
                    h,
                  ),
                  h.button(
                    [...sheet.closeButton, h.AriaLabel('Close filters and sort')],
                    [Icon.draw(icons.close, h, { size: '18px' })],
                  ),
                ]),
              ]
            : [],
        ),
    },
    h,
  )

export const filters = (model: Model, slots: Slots, h: H): Html =>
  h.div(slots.filters.attrs(), [
    h.div(slots.desktopTld.attrs(), [
      dropdown(
        {
          listbox: model.tldListbox,
          onMessage: message => Message.GotTldListboxMessage({ message }),
          label: 'Filter by TLD',
          values: TldFilter.literals,
          labelOf: tldLabel,
          value: model.tldFilter,
          searchText: value => (value === 'All' ? tldLabel(value) : String.toLowerCase(value)),
          tabStop: true,
        },
        h,
      ),
    ]),
    h.button(
      slots.mobileTld.attrs([
        h.Id(TLD_FILTER_BUTTON_ID),
        h.Type('button'),
        h.AriaLabel(`Filter by TLD: ${tldLabel(model.tldFilter)}`),
        h.AriaHasPopup('dialog'),
        h.AriaControls(model.tldSheet.dialog.id),
        h.AriaExpanded(Sheet.isOpen(model.tldSheet)),
        h.OnClick(Message.ClickedTldFilter()),
      ]),
      [h.span([], [tldLabel(model.tldFilter)]), Icon.draw(icons.chevronDown, h, { size: '14px' })],
    ),
    h.div(slots.desktopFilters.attrs(), [
      dropdown(
        {
          listbox: model.availabilityListbox,
          onMessage: message => Message.GotAvailabilityListboxMessage({ message }),
          label: 'Filter availability',
          values: AvailabilityFilter.literals,
          labelOf: value => availabilityLabels[value],
          value: model.availabilityFilter,
        },
        h,
      ),
      dropdown(
        {
          listbox: model.sortListbox,
          onMessage: message => Message.GotSortListboxMessage({ message }),
          label: 'Sort results',
          values: SortOrder.literals,
          labelOf: value => sortLabels[value],
          value: model.sortOrder,
        },
        h,
      ),
    ]),
    h.button(
      slots.filtersButton.attrs([
        h.Id(FILTERS_BUTTON_ID),
        h.Type('button'),
        h.AriaLabel('Filters and sort'),
        h.AriaHasPopup('dialog'),
        h.AriaControls(model.filtersSheet.dialog.id),
        h.AriaExpanded(Sheet.isOpen(model.filtersSheet)),
        // A dot on the button while a filter or sort is chosen, as upstream's.
        ...(model.availabilityFilter !== 'All' || model.sortOrder !== 'Relevance'
          ? [h.DataAttribute('active-filters', '')]
          : []),
        h.OnClick(Message.ClickedFilters()),
      ]),
      [Icon.draw(icons.filter, h, { size: '18px' })],
    ),
    tldSheet(model, slots, h),
    filtersSheet(model, slots, h),
  ])
