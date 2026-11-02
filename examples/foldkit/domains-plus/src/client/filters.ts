/**
 * The filters beside All Results, drawn twice and shown by width, as
 * upstream's are: on a desktop three dropdowns (the TLD with typeahead over
 * the catalog, availability and sort); on a phone the TLD's searchable sheet
 * and one "Filters and sort" sheet holding availability and sort together.
 * The Model keeps each value; these draw the controls that change it.
 */
import type * as UiListbox from '@foldkit/ui/listbox'
import { Array, Option, String } from 'effect'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { Icon } from 'foldkit-media'
import type { SlotBuilders } from 'foldkit-mixins'
import { Listbox, Sheet } from 'foldkit-mixins-ui'
import { Dropdown, type Model } from './app.js'
import { FILTERS_BUTTON_ID, SEARCH_FORM_ID, TLD_FILTER_BUTTON_ID } from './command.js'
import { AvailabilityFilter, SortOrder, TldFilter } from './domain'
import { icons } from './iconData.js'
import { Message } from './message.js'
import { ListboxLook, ListboxStyle, type Page } from './style.js'
import { onIntent, viewsOf } from './sheets.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

/** What the filters read: each value, and the dropdown or sheet that chooses it. */
export type FiltersInput = Pick<
  Model,
  | 'tldFilter'
  | 'tldListbox'
  | 'tldSheet'
  | 'tldSearchQuery'
  | 'availabilityFilter'
  | 'availabilityListbox'
  | 'sortOrder'
  | 'sortListbox'
  | 'filtersSheet'
  | 'sheetsLoaded'
>

export const availabilityLabels: Readonly<Record<AvailabilityFilter, string>> = {
  All: 'Show All',
  Available: 'Available',
}

export const sortLabels: Readonly<Record<SortOrder, string>> = {
  Relevance: 'Relevance',
  Length: 'Length',
  Alphabetical: 'Alphabetical',
  PriceAscending: 'Price: Low to High',
  PriceDescending: 'Price: High to Low',
}

export const tldLabel = (value: TldFilter): string =>
  value === 'All' ? 'All TLDs' : `.${String.toLowerCase(value)}`

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
      // The TLD panel's 557 rows scroll inside it, so it is a tab stop of its
      // own (axe's scrollable-region-focusable), as upstream's.
      ...(config.tabStop === true ? { itemsAttributes: childAttributes([h.Tabindex(0)]) } : {}),
      toView: Listbox.toView(mixins, { h }),
    },
    toParentMessage: config.onMessage,
  })
}

/** A select of the search form, sent as `name` with the search text. */
const plainSelect = <Value extends string>(
  config: {
    readonly name: string
    readonly label: string
    readonly values: ReadonlyArray<Value>
    readonly labelOf: (value: Value) => string
    readonly value: Value
  },
  slots: Slots,
  h: H,
): Html => {
  // A loop, not a mapper: the view-identity transform brands what each
  // function returns, and the serializer writes a `data-foldkit-identity`
  // marker per branded vnode, 557 of them on the TLD select (#465). The
  // options are children of the select, which is branded once.
  const options: Array<Html> = []
  for (const value of config.values) {
    options.push(
      h.option([h.Value(value), h.Selected(value === config.value)], [config.labelOf(value)]),
    )
  }
  return h.select(
    slots.plainSelect.attrs([
      h.Name(config.name),
      h.AriaLabel(config.label),
      h.Attribute('form', SEARCH_FORM_ID),
    ]),
    options,
  )
}

/**
 * The filters on a page without scripts: plain selects that belong to the
 * search form, so Apply, or Enter in the box, sends the text and the filters
 * together as a GET of the address the Mirror reads (`?q=&tld=&availability=&sort=`).
 */
const plainFilters = (model: FiltersInput, slots: Slots, h: H): Html =>
  h.div(slots.plainFilters.attrs(), [
    plainSelect(
      {
        name: 'tld',
        label: 'Filter by TLD',
        values: TldFilter.literals,
        labelOf: tldLabel,
        value: model.tldFilter,
      },
      slots,
      h,
    ),
    plainSelect(
      {
        name: 'availability',
        label: 'Filter availability',
        values: AvailabilityFilter.literals,
        labelOf: value => availabilityLabels[value],
        value: model.availabilityFilter,
      },
      slots,
      h,
    ),
    plainSelect(
      {
        name: 'sort',
        label: 'Sort results',
        values: SortOrder.literals,
        labelOf: value => sortLabels[value],
        value: model.sortOrder,
      },
      slots,
      h,
    ),
    h.button(slots.button.attrs([h.Type('submit'), h.Attribute('form', SEARCH_FORM_ID)]), [
      'Apply',
    ]),
  ])

export const filters = (model: FiltersInput, slots: Slots, h: H): Html =>
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
        ...onIntent(h),
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
        ...onIntent(h),
        h.OnClick(Message.ClickedFilters()),
      ]),
      [Icon.draw(icons.filter, h, { size: '18px' })],
    ),
    plainFilters(model, slots, h),
    ...(model.sheetsLoaded
      ? Option.match(viewsOf(), {
          onNone: () => [],
          onSome: views => [views.tldSheet(model, slots, h), views.filtersSheet(model, slots, h)],
        })
      : [
          h.dialog([h.Id(model.tldSheet.dialog.id)], []),
          h.dialog([h.Id(model.filtersSheet.dialog.id)], []),
        ]),
  ])
