/**
 * The Buttons and Card sections as an island: every button dispatches, and the card reads the count.
 */
import { Schema } from 'effect'
import { Runtime } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { SlotView } from 'foldkit-mixins'
import { Button, ButtonGroup, CardSlots, Toolbar } from 'foldkit-mixins-ui'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import {
  ButtonGroupStyle,
  CardPressedStyle,
  CardStyle,
  DestructiveButtonStyle,
  GhostButtonStyle,
  LargeButtonStyle,
  OutlineButtonStyle,
  PageStyle,
  PrimaryButtonStyle,
  SecondaryButtonStyle,
  SmallButtonStyle,
  ToolbarStyle,
} from '../style.js'
import { PageSlots } from '../slots.js'
import { neverH } from '../shared.js'

export const Model = Schema.Struct({
  clicks: Schema.Number,
  bold: Schema.Boolean,
  italic: Schema.Boolean,
  underline: Schema.Boolean,
  roving: RovingTabindex.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ButtonClicked: {},
  BoldToggled: { value: Schema.Boolean },
  ItalicToggled: { value: Schema.Boolean },
  UnderlineToggled: { value: Schema.Boolean },
  ToolbarFocused: { id: Schema.String },
})
export type Message = typeof Message.Type

export const initModel = (): Model => ({
  clicks: 0,
  bold: false,
  italic: false,
  underline: false,
  roving: { current: null },
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    ButtonClicked: () => ({ model: modifyFields(model, { clicks: clicks => clicks + 1 }) }),
    BoldToggled: ({ value }) => ({ model: modifyFields(model, { bold: () => value }) }),
    ItalicToggled: ({ value }) => ({ model: modifyFields(model, { italic: () => value }) }),
    UnderlineToggled: ({ value }) => ({ model: modifyFields(model, { underline: () => value }) }),
    // The tab stop is the control last focused, by key or by press.
    ToolbarFocused: ({ id }) =>
      model.roving.current === id
        ? { model }
        : { model: modifyFields(model, { roving: () => ({ current: id }) }) },
  })

const CardView = SlotView.forMessages<Message>()
  .define(CardSlots, (clicks: number, slots, h) =>
    h.article(slots.root.attrs(), [
      h.div(slots.header.attrs(), [
        h.h3(slots.title.attrs(), ['Usage this month']),
        h.p(slots.description.attrs(), ['Synced just now']),
      ]),
      h.p(slots.content.attrs(), [
        `The team pressed a button ${clicks} ${clicks === 1 ? 'time' : 'times'}. A card is page slots plus a recipe: no new CSS.`,
      ]),
      h.div(slots.footer.attrs(), [
        Button.view(
          { label: 'View report', style: PrimaryButtonStyle, onClick: Message.ButtonClicked() },
          h,
        ),
        Button.view({ label: 'Dismiss', style: GhostButtonStyle }, h),
      ]),
    ]),
  )
  .pipe(SlotView.attach(CardStyle.mixin), SlotView.attach(CardPressedStyle.mixin))

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      `Default is primary ink, Secondary a neutral fill, then Outline, Ghost, and Destructive. Pressed ${model.clicks} ${model.clicks === 1 ? 'time' : 'times'} — every button dispatches.`,
    ]),
    h.div(slots.row.attrs(), [
      Button.view(
        { label: 'Default', style: PrimaryButtonStyle, onClick: Message.ButtonClicked() },
        h,
      ),
      Button.view(
        {
          label: 'Secondary',
          style: SecondaryButtonStyle,
          onClick: Message.ButtonClicked(),
        },
        h,
      ),
      Button.view(
        { label: 'Outline', style: OutlineButtonStyle, onClick: Message.ButtonClicked() },
        h,
      ),
      Button.view({ label: 'Ghost', style: GhostButtonStyle, onClick: Message.ButtonClicked() }, h),
      Button.view(
        {
          label: 'Destructive',
          style: DestructiveButtonStyle,
          onClick: Message.ButtonClicked(),
        },
        h,
      ),
    ]),
    h.div(slots.row.attrs(), [
      Button.view({ label: 'Small', style: SmallButtonStyle, onClick: Message.ButtonClicked() }, h),
      Button.view({ label: 'Large', style: LargeButtonStyle, onClick: Message.ButtonClicked() }, h),
      Button.view({ label: 'Disabled', style: PrimaryButtonStyle, disabled: true }, h),
    ]),
    h.p(slots.sectionText.attrs(), [
      'A joined group toggles real style: bold, italic, and underline write the Model, and the line below reads it back.',
    ]),
    ButtonGroup.view(
      {
        label: 'Text style',
        items: [
          Button.view(
            {
              label: 'B',
              style: model.bold ? SecondaryButtonStyle : OutlineButtonStyle,
              onClick: Message.BoldToggled({ value: !model.bold }),
            },
            h,
          ),
          Button.view(
            {
              label: 'I',
              style: model.italic ? SecondaryButtonStyle : OutlineButtonStyle,
              onClick: Message.ItalicToggled({ value: !model.italic }),
            },
            h,
          ),
          Button.view(
            {
              label: 'U',
              style: model.underline ? SecondaryButtonStyle : OutlineButtonStyle,
              onClick: Message.UnderlineToggled({ value: !model.underline }),
            },
            h,
          ),
        ],
        style: ButtonGroupStyle,
      },
      neverH,
    ),
    h.p(
      slots.sectionText.attrs([
        h.Style({
          fontWeight: model.bold ? '700' : '400',
          fontStyle: model.italic ? 'italic' : 'normal',
          textDecoration: model.underline ? 'underline' : 'none',
        }),
      ]),
      ['The quick brown fox'],
    ),
    h.p(slots.sectionText.attrs(), [
      'The same state in a Toolbar: one tab stop, the arrow keys move between its tools, Home and End jump, and the disabled tool is skipped.',
    ]),
    Toolbar.view(
      {
        id: 'text-tools',
        label: 'Text style',
        orientation: 'horizontal',
        roving: model.roving,
        onFocus: id => Message.ToolbarFocused({ id }),
        style: ToolbarStyle,
        items: [
          {
            label: 'Style',
            controls: [
              {
                id: 'bold',
                draw: control =>
                  Button.view(
                    {
                      label: 'Bold',
                      pressed: model.bold,
                      onClick: Message.BoldToggled({ value: !model.bold }),
                      attributes: { button: control.attributes },
                      style: model.bold ? SecondaryButtonStyle : OutlineButtonStyle,
                    },
                    h,
                  ),
              },
              {
                id: 'italic',
                draw: control =>
                  Button.view(
                    {
                      label: 'Italic',
                      pressed: model.italic,
                      onClick: Message.ItalicToggled({ value: !model.italic }),
                      attributes: { button: control.attributes },
                      style: model.italic ? SecondaryButtonStyle : OutlineButtonStyle,
                    },
                    h,
                  ),
              },
              {
                id: 'strike',
                disabled: true,
                draw: control =>
                  Button.view(
                    {
                      label: 'Strike',
                      disabled: control.disabled,
                      attributes: { button: control.attributes },
                      style: OutlineButtonStyle,
                    },
                    h,
                  ),
              },
            ],
          },
          'separator',
          {
            id: 'underline',
            draw: control =>
              Button.view(
                {
                  label: 'Underline',
                  pressed: model.underline,
                  onClick: Message.UnderlineToggled({ value: !model.underline }),
                  attributes: { button: control.attributes },
                  style: model.underline ? SecondaryButtonStyle : OutlineButtonStyle,
                },
                h,
              ),
          },
        ],
      },
      h,
    ),
    h.section(slots.section.attrs([h.Id('card')]), [
      h.h2(slots.sectionTitle.attrs(), ['Card']),
      h.p(slots.sectionText.attrs(), [
        'The shadcn card: base surface, hairline border, large radius, soft shadow.',
      ]),
      CardView(model.clicks, h),
    ]),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel() }),
      update,
      view,
    }),
  )
}
