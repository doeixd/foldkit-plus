import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Disclosure as UiDisclosure } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Disclosure } from 'foldkit-mixins-ui'

import * as Icon from '../../icon.js'
import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import {
  AnimatedDisclosureStyle,
  BasicDisclosureStyle,
  DisclosurePageSlots,
  DisclosurePageStyle,
  PreviewDisclosureStyle,
} from '../style/disclosure.js'

const DISCLOSURE_BASIC_DEMO_ID = 'disclosure-basic-demo'
const DISCLOSURE_ANIMATED_DEMO_ID = 'disclosure-animated-demo'
const DISCLOSURE_COLLAPSED_PREVIEW_DEMO_ID = 'disclosure-collapsed-preview-demo'
const COLLAPSED_PREVIEW_HEIGHT = '6rem'

const PANEL_TEXT =
  'Foldkit is an Elm-inspired UI framework powered by Effect. It brings the Model-View-Update architecture to TypeScript with Schema-typed state, explicit side effects via commands, and composable headless UI components.'

const COLLAPSED_PREVIEW_PARAGRAPHS: ReadonlyArray<string> = [
  'Foldkit keeps application state in one Model. Messages record facts, and update decides how each fact changes that Model.',
  'Commands describe one-time work for the Runtime, so network requests, focus changes, and storage writes stay outside state transitions.',
  'That separation leaves every transition visible in one place and gives tests the same inputs and outputs the application uses.',
]

type Slots = SlotBuilders<typeof DisclosurePageSlots, UiMessage>

/** The chevron turns over while the button is `data-open`, which its Style reads. */
const buttonContent = (slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(slots.buttonContent.attrs(), [
    h.span(slots.buttonLabel.attrs(), ['What is Foldkit?']),
    h.span(slots.chevron.attrs(), [Icon.chevronDown(slots.chevronIcon.attrs(), h)]),
  ])

const panelText = (slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.p(slots.panelText.attrs(), [PANEL_TEXT])

const collapsedPreviewPanel = (slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.div(
    slots.previewText.attrs(),
    COLLAPSED_PREVIEW_PARAGRAPHS.map(paragraph => h.p(slots.previewParagraph.attrs(), [paragraph])),
  )

const fieldLabel = (id: string, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  h.label(slots.fieldLabel.attrs([h.For(UiDisclosure.buttonId(id))]), ['Frequently asked'])

const DisclosurePage = SlotView.forMessages<UiMessage>()
  .define(DisclosurePageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Disclosure']),

      h.h3(slots.section.attrs(), ['Basic']),
      fieldLabel(DISCLOSURE_BASIC_DEMO_ID, slots, h),
      UiDisclosure.view(
        {
          id: DISCLOSURE_BASIC_DEMO_ID,
          isOpen: model.isDisclosureBasicDemoOpen,
          onToggle: isOpen => UiMessage.ToggledDisclosureBasicDemo({ isOpen }),
          toView: attributes => {
            const disclosure = Disclosure.resolve(attributes, [BasicDisclosureStyle.mixin], {
              input: undefined,
              h,
            })

            return h.div(slots.demo.attrs(), [
              h.button(disclosure.button, [buttonContent(slots, h)]),
              model.isDisclosureBasicDemoOpen
                ? h.div(disclosure.panel, [panelText(slots, h)])
                : h.empty,
            ])
          },
        },
        h,
      ),

      h.h3(slots.section.attrs(), ['Animated']),
      fieldLabel(DISCLOSURE_ANIMATED_DEMO_ID, slots, h),
      UiDisclosure.view(
        {
          id: DISCLOSURE_ANIMATED_DEMO_ID,
          isOpen: model.isDisclosureAnimatedDemoOpen,
          onToggle: isOpen => UiMessage.ToggledDisclosureAnimatedDemo({ isOpen }),
          toView: attributes => {
            const disclosure = Disclosure.resolve(attributes, [AnimatedDisclosureStyle.mixin], {
              input: undefined,
              h,
            })

            return h.div(slots.animatedFrame.attrs(), [
              h.button(disclosure.button, [buttonContent(slots, h)]),
              disclosure.animatePanel(h.div(disclosure.panel, [panelText(slots, h)])),
            ])
          },
        },
        h,
      ),

      h.h3(slots.section.attrs(), ['Collapsed preview']),
      h.p(slots.fieldLabel.attrs(), ['Featured article']),
      UiDisclosure.view(
        {
          id: DISCLOSURE_COLLAPSED_PREVIEW_DEMO_ID,
          isOpen: model.isDisclosureCollapsedPreviewDemoOpen,
          onToggle: isOpen => UiMessage.ToggledDisclosureCollapsedPreviewDemo({ isOpen }),
          toView: attributes => {
            const disclosure = Disclosure.resolve(attributes, [PreviewDisclosureStyle.mixin], {
              input: undefined,
              h,
            })

            return h.article(slots.article.attrs(), [
              h.h4(slots.articleTitle.attrs(), ['Why the Elm Architecture scales']),
              h.div(slots.preview.attrs(), [
                disclosure.animatePanel(
                  h.div(disclosure.panel, [collapsedPreviewPanel(slots, h)]),
                  { peek: COLLAPSED_PREVIEW_HEIGHT },
                ),
                ...(model.isDisclosureCollapsedPreviewDemoOpen
                  ? []
                  : [h.div(slots.fade.attrs([h.AriaHidden(true)]))]),
              ]),
              h.div(slots.previewActions.attrs(), [
                h.button(disclosure.button, [
                  model.isDisclosureCollapsedPreviewDemoOpen ? 'Show less' : 'Read more',
                ]),
              ]),
            ])
          },
        },
        h,
      ),
    ]),
  )
  .pipe(Style.attach(DisclosurePageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(DisclosurePage)
