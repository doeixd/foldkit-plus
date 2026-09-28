import { Tabs as UiTabs } from '@foldkit/ui'
import { Array, Equal, HashSet, Match, Option, pipe } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotAttributes, type SlotBuilders } from 'foldkit-mixins'
import { Tabs } from 'foldkit-mixins-ui'

import { Step } from '../domain/index.js'
import { Message } from '../message.js'
import { type Model } from '../model.js'
import {
  Attachments,
  CoverLetter,
  Education,
  PersonalInfo,
  Skills,
  WorkHistory,
} from '../step/index.js'
import {
  JobPage,
  PreviewToggleStyle,
  PrimaryButtonStyle,
  SecondaryButtonStyle,
  StepTabsStyle,
} from '../style.js'
import * as Button from './button.js'
import { Preview } from './preview.js'
import { Review } from './review.js'
import { stepMenu, stepTabButton } from './stepNav.js'

type Slots = SlotBuilders<typeof JobPage.slots, Message>

const StepTabs = UiTabs.create<Step.Step>()

const stepHasErrors =
  (model: Model) =>
  (step: Step.Step): boolean =>
    Match.value(step).pipe(
      Match.when('PersonalInfo', () => PersonalInfo.hasErrors(model.personalInfo)),
      Match.when('WorkHistory', () => WorkHistory.hasErrors(model.workHistory)),
      Match.when('Education', () => Education.hasErrors(model.education)),
      Match.when('Skills', () => Skills.hasErrors(model.skills)),
      Match.orElse(() => false),
    )

const stepIsComplete =
  (model: Model) =>
  (step: Step.Step): boolean =>
    Match.value(step).pipe(
      Match.when('PersonalInfo', () => PersonalInfo.isComplete(model.personalInfo)),
      Match.when('WorkHistory', () => WorkHistory.isComplete(model.workHistory)),
      Match.when('Education', () => Education.isComplete(model.education)),
      Match.when('Skills', () => Skills.isComplete(model.skills)),
      Match.orElse(() => true),
    )

const stepNeedsAttention =
  (model: Model) =>
  (step: Step.Step): boolean =>
    stepHasErrors(model)(step) || (model.isSubmitAttempted && !stepIsComplete(model)(step))

const stepsNeedingAttention = (model: Model): ReadonlyArray<Step.Step> =>
  Array.filter(Step.all, stepNeedsAttention(model))

const stepContent = (
  model: Model,
  attentionSteps: ReadonlyArray<Step.Step>,
  h: HtmlBuilder<Message>,
): Html =>
  Match.value(model.currentStep).pipe(
    Match.when('PersonalInfo', () =>
      h.submodel({
        slotId: 'personal-info',
        model: model.personalInfo,
        view: PersonalInfo.view,
        toParentMessage: message => Message.GotPersonalInfoMessage({ message }),
      }),
    ),
    Match.when('WorkHistory', () =>
      h.submodel({
        slotId: 'work-history',
        model: model.workHistory,
        view: WorkHistory.view,
        toParentMessage: message => Message.GotWorkHistoryMessage({ message }),
      }),
    ),
    Match.when('Education', () =>
      h.submodel({
        slotId: 'education',
        model: model.education,
        view: Education.view,
        toParentMessage: message => Message.GotEducationMessage({ message }),
      }),
    ),
    Match.when('Skills', () =>
      h.submodel({
        slotId: 'skills',
        model: model.skills,
        view: Skills.view,
        toParentMessage: message => Message.GotSkillsMessage({ message }),
      }),
    ),
    Match.when('CoverLetter', () =>
      h.submodel({
        slotId: 'cover-letter',
        model: model.coverLetter,
        view: CoverLetter.view,
        toParentMessage: message => Message.GotCoverLetterMessage({ message }),
      }),
    ),
    Match.when('Attachments', () =>
      h.submodel({
        slotId: 'attachments',
        model: model.attachments,
        view: Attachments.view,
        toParentMessage: message => Message.GotAttachmentsMessage({ message }),
      }),
    ),
    Match.when('Review', () => Review({ model, attentionSteps }, h)),
    Match.exhaustive,
  )

const isFirstStep = (model: Model): boolean =>
  pipe(Step.all, Array.head, Option.exists(Equal.equals(model.currentStep)))

const isLastStep = (model: Model): boolean =>
  pipe(Step.all, Array.last, Option.exists(Equal.equals(model.currentStep)))

/** Previous and Next, under every step but Review. */
export const Navigation = SlotView.forMessages<Message>()
  .define(JobPage.slots, (model: Model, slots, h) =>
    h.div(slots.navigation.attrs(), [
      ...(isFirstStep(model)
        ? [h.empty]
        : [
            Button.view(
              {
                label: '← Previous',
                style: SecondaryButtonStyle,
                onClick: Message.ClickedPrevious(),
              },
              h,
            ),
          ]),
      ...(isLastStep(model)
        ? []
        : [
            Button.view(
              { label: 'Next →', style: PrimaryButtonStyle, onClick: Message.ClickedNext() },
              h,
            ),
          ]),
    ]),
  )
  .pipe(Style.attach(JobPage.style))

const stepContentPanel = (
  model: Model,
  attentionSteps: ReadonlyArray<Step.Step>,
  panelAttributes: SlotAttributes<Message>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(panelAttributes, [
    h.h2(slots.stepHeading.attrs(), [Step.show(model.currentStep)]),
    h.div(slots.stepBody.attrs(), [stepContent(model, attentionSteps, h)]),
    ...(model.currentStep !== 'Review' ? [Navigation(model, h)] : []),
  ])

const previewSidebar = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.previewSidebar.attrs(), [
    h.div(slots.sticky.attrs(), [
      h.h2(slots.previewHeading.attrs(), ['Live Preview']),
      h.div(slots.previewCard.attrs(), [Preview(model, h)]),
    ]),
  ])

const previewToggle = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.previewDock.attrs(), [
    Button.view(
      {
        label: model.isPreviewVisible ? 'Hide Preview' : 'Preview',
        style: PreviewToggleStyle,
        input: model.isPreviewVisible,
        onClick: Message.ToggledPreview(),
      },
      h,
    ),
  ])

const previewOverlay = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.previewOverlay.attrs(), [Preview(model, h)])

/**
 * What the step tabs draw: the tab list, the chosen step's panel, and the
 * preview beside it. Its input is the Model and the tabs as `@foldkit/ui`
 * renders them.
 */
export const StepLayout = SlotView.forMessages<Message>()
  .define(
    JobPage.slots,
    (
      {
        model,
        attentionSteps,
        render,
      }: Readonly<{
        model: Model
        attentionSteps: ReadonlyArray<Step.Step>
        render: UiTabs.RenderInfo<Step.Step>
      }>,
      slots,
      h,
    ) => {
      const attentionStepSet = HashSet.fromIterable(attentionSteps)
      const { tablist, tabs, activeIndex } = Tabs.resolve(render, [StepTabsStyle.mixin], { h })

      return h.div(slots.layout.attrs(), [
        h.div(slots.sidebar.attrs(), [
          h.div(slots.sticky.attrs(), [
            h.div(
              tablist,
              Array.map(tabs, tab => stepTabButton(tab, model.currentStep, attentionStepSet, h)),
            ),
          ]),
        ]),
        ...pipe(
          tabs,
          Array.filter(tab => tab.index === activeIndex),
          Array.map(tab => stepContentPanel(model, attentionSteps, tab.panel, slots, h)),
        ),
        previewSidebar(model, slots, h),
        previewToggle(model, slots, h),
        ...(model.isPreviewVisible ? [previewOverlay(model, slots, h)] : []),
      ])
    },
  )
  .pipe(Style.attach(JobPage.style))

export const Page = SlotView.forMessages<Message>()
  .define(JobPage.slots, (model: Model, slots, h) => {
    const attentionSteps = stepsNeedingAttention(model)
    return h.div(slots.page.attrs(), [
      h.div(slots.container.attrs(), [
        h.div(slots.header.attrs(), [
          h.h1(slots.title.attrs(), ['Apply to Work on Foldkit']),
          h.p(slots.subtitle.attrs(), [
            'Fill out the form below and watch your resume build in real time.',
          ]),
        ]),
        h.div(slots.stepMenu.attrs(), [
          stepMenu(
            model,
            HashSet.fromIterable(attentionSteps),
            message => Message.GotStepMenuMessage({ message }),
            h,
          ),
        ]),
        h.submodel({
          slotId: model.stepTabs.id,
          model: model.stepTabs,
          view: StepTabs.view,
          viewInputs: {
            tabs: Step.all,
            selectedValue: model.currentStep,
            ariaLabel: 'Application steps',
            orientation: 'Vertical',
            toView: render => StepLayout({ model, attentionSteps, render }, h),
          },
          toParentMessage: message => Message.GotStepTabsMessage({ message }),
        }),
      ]),
    ])
  })
  .pipe(Style.attach(JobPage.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Job Application',
  body: Page(model, h),
})
