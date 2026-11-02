/**
 * The views of the cart's sheet and the phone's two filter sheets, in a chunk
 * of their own: a closed sheet draws a bare dialog (`sheets.ts`), and this
 * loads when the reader reaches for what opens one.
 */
import { Array, Layer, String, pipe } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Icon } from 'foldkit-media'
import type { SlotAttributes, SlotBuilders } from 'foldkit-mixins'
import { Sheet } from 'foldkit-mixins-ui'
import { CART_CLOSE_BUTTON_ID } from './command.js'
import { type CartInput, items, total } from './cart.js'
import { AvailabilityFilter, SortOrder, TldFilter } from './domain'
import { availabilityLabels, type FiltersInput, sortLabels, tldLabel } from './filters.js'
import { icons } from './iconData.js'
import { Message } from './message.js'
import { Sheets } from './sheets.js'
import {
  CartSheetLook,
  CartSheetStyle,
  FiltersSheetLook,
  SheetLook,
  SheetStyle,
  TldSheetLook,
} from './sheetStyle.js'
import type { Page } from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

const cartSheet = (model: CartInput, slots: Slots, h: H): Html =>
  Sheet.view(
    {
      model: model.cartSheet,
      onMessage: message => Message.GotCartSheetMessage({ message }),
      mixins: [CartSheetStyle.mixin, SheetLook.mixin, CartSheetLook.mixin],
      hasDescription: true,
      draw: sheet =>
        h.dialog(
          sheet.dialog,
          sheet.isVisible
            ? [
                h.div(sheet.backdrop),
                h.section(
                  [...sheet.panel, h.AriaLabel('Your cart')],
                  [
                    h.div(slots.cartPanel.attrs(), [
                      h.div(slots.cartHeading.attrs(), [
                        h.h2(sheet.title, ['Your cart']),
                        h.button(
                          [
                            ...sheet.closeButton,
                            ...sheet.initialFocus,
                            h.Id(CART_CLOSE_BUTTON_ID),
                            h.AriaLabel('Close cart panel'),
                          ],
                          [Icon.draw(icons.close, h, { size: '18px' })],
                        ),
                      ]),
                      items(
                        model,
                        domain =>
                          h.button(
                            slots.iconButton.attrs([
                              h.Type('button'),
                              h.AriaLabel(`Remove ${domain.name}`),
                              h.OnClick(Message.ClickedRemoveCartDomain({ name: domain.name })),
                            ]),
                            [Icon.draw(icons.close, h, { size: '18px' })],
                          ),
                        slots,
                        h,
                      ),
                      total(model, slots.cartTotal, h),
                      h.p(sheet.description, [
                        'Demo cart with sample prices and availability. No domains are reserved. No purchases are made.',
                      ]),
                    ]),
                  ],
                ),
              ]
            : [],
        ),
    },
    h,
  )

/** The phone's sorts, as upstream's: one "Price" stands for both price orders. */
const phoneSorts: ReadonlyArray<SortOrder> = [
  'Relevance',
  'Length',
  'PriceAscending',
  'Alphabetical',
]

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

const choiceContent = (label: string, slots: Slots, h: H): ReadonlyArray<Html> => [
  h.span([], [label]),
  h.span(slots.choiceCheck.attrs([h.AriaHidden(true)]), [
    Icon.draw(icons.check, h, { size: '20px' }),
  ]),
]

const tldSheet = (model: FiltersInput, slots: Slots, h: H): Html =>
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

const filtersSheet = (model: FiltersInput, slots: Slots, h: H): Html =>
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

export const layer = Layer.succeed(Sheets, { cartSheet, tldSheet, filtersSheet })
