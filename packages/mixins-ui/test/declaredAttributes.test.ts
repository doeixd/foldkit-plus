/**
 * A Slot declares the role and ARIA attributes its element carries, so a
 * Mixin that sets the same one is a conflict and an accessibility pattern can
 * require it. Each widget below is drawn inert with a minimal fixture and
 * every `role` and `aria-*` on an element a Slot drew is compared with that
 * Slot's declaration; a written but undeclared one fails.
 *
 * Covered: the widgets listed in `fixtures`, drawn by a view this package
 * writes, and the Checkbox, Switch and RadioGroup bundles. Not covered: the
 * other catalog widgets, whose fixtures need a Model or an upstream component
 * not built here (Alert, Calendar, Card, Carousel, CascadeSelect, Chart,
 * ChatMessage, Combobox, Command, DatePicker, Dialog, Drawer, FloatingPanel,
 * ImageCropper, Listbox, Menu, Menubar, MessageScroller, Nav, NumberField,
 * PasswordInput, Picker, Segmented, Sidebar, SignaturePad, Steps, TagsInput,
 * Timer, Toast, Tour, WindowList and the rest): a gap there is found only by
 * reading.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import * as RadioGroupUi from '@foldkit/ui/radioGroup'
import { view as checkboxView } from '@foldkit/ui/checkbox'
import { view as switchView } from '@foldkit/ui/switch'
import { Attr, SlotView, Style, type SlotAttributes } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  AngleSlider,
  AngleSliderSlots,
  Checkbox,
  CheckboxGroup,
  ColorPicker,
  ColorPickerSlots,
  CheckboxGroupSlots,
  CheckboxSlots,
  RadioGroup,
  RadioGroupSlots,
  Rating,
  RatingSlots,
  Recipes,
  Resizable,
  ResizableSlots,
  Slider,
  SliderSlots,
  Switch,
  SwitchSlots,
  TreeView,
  TreeViewSlots,
} from '../src/index.js'
import { AccordionSlots, view as drawAccordion } from '../src/accordion.js'
import { BreadcrumbSlots, view as drawBreadcrumb } from '../src/breadcrumb.js'
import { ButtonGroupSlots, view as drawButtonGroup } from '../src/buttonGroup.js'
import { PaginationSlots, view as drawPagination } from '../src/pagination.js'
import { ScrollAreaSlots, view as drawScrollArea } from '../src/scrollArea.js'
import { TableSlots, view as drawTable } from '../src/table.js'
import { h, message, type TestMessage } from './fixture.js'

interface Declared {
  readonly [slot: string]: {
    readonly attributes: ReadonlyArray<string | { readonly name: string }>
  }
}

const normalize = (name: string): string => name.replace(/[^a-z0-9]/gi, '').toLowerCase()
const isAccessible = (name: string): boolean => /^(role|aria)/.test(normalize(name))

/** Each slot to the role and ARIA names its elements carry, normalized. */
type Written = ReadonlyMap<string, ReadonlySet<string>>

const writtenBy = (drawn: Html, slots: Declared): Written => {
  const found = new Map<string, Set<string>>()
  for (const slot of Object.keys(slots)) {
    for (const node of Inert.bySlot(drawn, slot)) {
      const names = [
        ...Object.keys(node.data?.attrs ?? {}),
        ...Object.keys(node.data?.props ?? {}),
      ].filter(isAccessible)
      const held = found.get(slot) ?? new Set<string>()
      for (const name of names) held.add(normalize(name))
      found.set(slot, held)
    }
  }
  return found
}

/** One element per resolved slot, so a bundle is read as the elements it would draw. */
const elementsOf = <Message>(
  bundles: Readonly<Record<string, SlotAttributes<Message>>>,
  builder: HtmlBuilder<Message>,
): Html =>
  builder.div(
    [],
    Object.values(bundles).map(attributes => builder.div([...attributes], [])),
  )

const draw = <Message = TestMessage>(
  slots: Declared,
  view: (builder: HtmlBuilder<Message>) => Html,
): Written =>
  writtenBy(
    Inert.draw(
      SlotView.forMessages<Message>().define(slots, (_: undefined, __, builder) => view(builder)),
      undefined,
    ),
    slots,
  )

interface Fixture {
  readonly name: string
  readonly slots: Declared
  readonly written: () => Written
}

const sliderOptions = {
  id: 'price',
  label: 'Price',
  min: 0,
  max: 200,
  step: 10,
  format: (amount: number) => `$${amount}`,
  onChange: () => message('Clicked'),
}

const files = [
  {
    id: 'src',
    label: 'src',
    children: [{ id: 'index', label: 'index.ts' }],
  },
]

const fixtures: ReadonlyArray<Fixture> = [
  {
    name: 'Accordion',
    slots: AccordionSlots,
    written: () =>
      draw(AccordionSlots, () =>
        drawAccordion(
          {
            id: 'settings',
            items: [{ id: 'billing', title: 'Billing', content: 'Seats.' }],
            open: ['billing'],
            onToggle: () => message('Clicked'),
            style: Style.forSlots(AccordionSlots)(Recipes.Accordion({})),
          },
          h,
        ),
      ),
  },
  {
    name: 'AngleSlider',
    slots: AngleSliderSlots,
    written: () =>
      draw(AngleSliderSlots, () =>
        AngleSlider.view(
          {
            model: AngleSlider.init({ id: 'heading', value: 90 }),
            label: 'Heading',
            onMessage: () => message('Clicked'),
          },
          h,
        ),
      ),
  },
  {
    name: 'Rating',
    slots: RatingSlots,
    written: () =>
      draw(RatingSlots, () =>
        Rating.view(
          {
            id: 'stay',
            label: 'Your stay',
            value: Option.some(3),
            onChange: () => message('Clicked'),
          },
          h,
        ),
      ),
  },
  {
    name: 'Rating, read-only',
    slots: RatingSlots,
    written: () =>
      draw(RatingSlots, () =>
        Rating.view({ id: 'stay', label: 'Your stay', value: Option.some(3), readOnly: true }, h),
      ),
  },
  {
    name: 'Slider',
    slots: SliderSlots,
    written: () => draw(SliderSlots, () => Slider.view({ ...sliderOptions, value: 40 }, h)),
  },
  {
    name: 'Slider, range',
    slots: SliderSlots,
    written: () =>
      draw(SliderSlots, () => Slider.view({ ...sliderOptions, value: { low: 20, high: 80 } }, h)),
  },
  {
    name: 'TreeView, checkable',
    slots: TreeViewSlots,
    written: () =>
      draw(TreeViewSlots, () =>
        TreeView.view(
          {
            label: 'Files',
            model: { ...TreeView.init({ id: 'files' }), open: ['src'] },
            nodes: files,
            onMessage: () => message('Clicked'),
            checkable: true,
          },
          h,
        ),
      ),
  },
  {
    name: 'Pagination',
    slots: PaginationSlots,
    written: () =>
      draw(PaginationSlots, () =>
        drawPagination({ page: 2, pageCount: 5, onPage: () => message('Clicked'), ends: true }, h),
      ),
  },
  {
    name: 'Breadcrumb',
    slots: BreadcrumbSlots,
    written: () =>
      draw(BreadcrumbSlots, () =>
        drawBreadcrumb(
          {
            steps: [
              { label: 'Docs', href: '/docs' },
              { label: 'Dialog', current: true },
            ],
          },
          h,
        ),
      ),
  },
  {
    name: 'ScrollArea, labelled',
    slots: ScrollAreaSlots,
    written: () =>
      draw(ScrollAreaSlots, () =>
        drawScrollArea({ content: h.p([], ['Words']), label: 'Release notes' }, h),
      ),
  },
  {
    name: 'ButtonGroup',
    slots: ButtonGroupSlots,
    written: () =>
      draw(ButtonGroupSlots, () =>
        drawButtonGroup({ label: 'Actions', items: [h.button([], ['Save']), 'or'] }, h),
      ),
  },
  {
    name: 'Resizable',
    slots: ResizableSlots,
    written: () =>
      draw(ResizableSlots, () =>
        Resizable.view(
          {
            model: Resizable.init(0.5),
            onMessage: () => message('Clicked'),
            label: 'Sidebar width',
            id: 'split',
            first: h.p([], ['One']),
            second: h.p([], ['Two']),
          },
          h,
        ),
      ),
  },
  {
    name: 'CheckboxGroup',
    slots: CheckboxGroupSlots,
    written: () =>
      draw(CheckboxGroupSlots, () =>
        CheckboxGroup.view(
          {
            id: 'alerts',
            legend: 'Send me',
            options: [
              { value: 'mentions', label: 'Mentions' },
              { value: 'digest', label: 'Digest' },
            ],
            checked: ['digest'],
            onToggle: () => message('Clicked'),
            selectAll: { label: 'All', onSet: () => message('Other') },
          },
          h,
        ),
      ),
  },
  {
    name: 'ColorPicker',
    slots: ColorPickerSlots,
    written: () =>
      draw(ColorPickerSlots, () =>
        ColorPicker.view(
          {
            model: ColorPicker.init({ id: 'accent', color: ColorPicker.color('#3b82f6') }),
            label: 'Accent',
            onMessage: () => message('Clicked'),
          },
          h,
        ),
      ),
  },
  {
    name: 'Table, sorted',
    slots: TableSlots,
    written: () =>
      draw(TableSlots, () =>
        drawTable(
          {
            columns: [
              { header: 'Name', sortKey: 'name', value: (row: { name: string }) => row.name },
            ],
            rows: [{ name: 'Apples' }],
            rowKey: row => row.name,
            sort: {
              by: Option.some({ column: 'name', direction: 'ascending' }),
              onSort: () => message('Clicked'),
            },
          },
          h,
        ),
      ),
  },
  {
    name: 'Checkbox',
    slots: CheckboxSlots,
    written: () =>
      draw(CheckboxSlots, () => {
        let drawn: Html = null
        checkboxView<TestMessage>(
          {
            id: 'terms',
            isChecked: true,
            onToggle: () => message('Other'),
            toView: attributes => {
              drawn = elementsOf(Checkbox.resolve(attributes, [], { input: undefined, h }), h)
              return h.div([], [])
            },
          },
          h,
        )
        return drawn
      }),
  },
  {
    name: 'Switch',
    slots: SwitchSlots,
    written: () =>
      draw(SwitchSlots, () => {
        let drawn: Html = null
        switchView<TestMessage>(
          {
            id: 'alerts',
            isChecked: true,
            onToggle: () => message('Other'),
            toView: attributes => {
              drawn = elementsOf(Switch.resolve(attributes, [], { input: undefined, h }), h)
              return h.div([], [])
            },
          },
          h,
        )
        return drawn
      }),
  },
  {
    name: 'RadioGroup',
    slots: RadioGroupSlots,
    written: () =>
      draw<RadioGroupUi.Message>(RadioGroupSlots, builder => {
        const Demo = RadioGroupUi.create<'free' | 'pro'>()
        let drawn: Html = null
        Demo.view(
          RadioGroupUi.init({ id: 'plan' }),
          {
            options: ['free', 'pro'] as const,
            selectedValue: Option.some('pro'),
            ariaLabel: 'Plan',
            toView: render => {
              const group = RadioGroup.resolve(render, [], { input: undefined, h: builder })
              drawn = builder.div(
                [],
                [
                  elementsOf({ group: group.group }, builder),
                  ...group.options.map(option =>
                    elementsOf(
                      {
                        option: option.option,
                        label: option.label,
                        description: option.description,
                        card: option.card,
                      },
                      builder,
                    ),
                  ),
                ],
              )
              return builder.div([], [])
            },
          },
          builder,
        )
        return drawn
      }),
  },
]

/**
 * Only an attribute with an `Attr` token can be declared. One without
 * (`aria-hidden`, `aria-valuemin`, `aria-level`, `aria-sort`, ...) is not
 * judged until `foldkit-mixins` gains its token.
 */
const hasToken = (name: string): boolean =>
  Object.values(Attr).some(
    token =>
      typeof token === 'object' &&
      token !== null &&
      'name' in token &&
      normalize(String(token.name)) === name,
  )

const undeclared = (fixture: Fixture): ReadonlyArray<string> => {
  const written = fixture.written()
  return [...written].flatMap(([slot, names]) => {
    const declared = new Set(
      (fixture.slots[slot]?.attributes ?? []).map(attribute =>
        normalize(typeof attribute === 'string' ? attribute : attribute.name),
      ),
    )
    return [...names]
      .filter(name => hasToken(name) && !declared.has(name))
      .map(name => `${slot}: ${name}`)
  })
}

describe('declared attributes', () => {
  it.each(fixtures.map(fixture => [fixture.name, fixture] as const))(
    '%s declares every role and ARIA attribute it writes',
    (_name, fixture) => {
      expect(undeclared(fixture)).toEqual([])
    },
  )

  it('reads the attributes a fixture writes, so an empty comparison cannot pass', () => {
    for (const fixture of fixtures) {
      const written = [...fixture.written().values()].reduce((sum, names) => sum + names.size, 0)
      expect(written, fixture.name).toBeGreaterThan(0)
    }
  })

  it('reports an attribute its Slot does not declare', () => {
    const group = fixtures.find(fixture => fixture.name === 'ButtonGroup')
    if (group === undefined) throw new Error('no ButtonGroup fixture')
    const bare = { ...ButtonGroupSlots, root: { attributes: [] } }
    expect(undeclared({ ...group, slots: bare })).toEqual(['root: role', 'root: arialabel'])
  })
})
