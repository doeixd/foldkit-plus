import { Menu, Tabs } from '@foldkit/ui'
import { Array, Option, pipe } from 'effect'
import { Update } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { applicationPayload } from './application.js'
import { SubmitApplication } from './command.js'
import { Step } from './domain/index.js'
import { Message } from './message.js'
import { type Model, Submission } from './model.js'
import {
  Attachments,
  CoverLetter,
  Education,
  PersonalInfo,
  Skills,
  WorkHistory,
} from './step/index.js'

const StepMenu = Menu.create<Step.Step>()
const StepTabs = Tabs.create<Step.Step>()

const toNextStep = (current: Step.Step): Step.Step =>
  pipe(
    Step.all,
    Array.get(Step.indexOf(current) + 1),
    Option.getOrElse(() => current),
  )

const toPreviousStep = (current: Step.Step): Step.Step =>
  pipe(
    Step.all,
    Array.get(Step.indexOf(current) - 1),
    Option.getOrElse(() => current),
  )

type StepKey =
  'personalInfo' | 'workHistory' | 'education' | 'skills' | 'coverLetter' | 'attachments'

/**
 * Where a step lives in the Model. A step left as it was leaves the Model as it
 * was, since Foldkit redraws only for a new Model.
 */
const stepAt = <Key extends StepKey>(key: Key) => ({
  read: (model: Model) => Option.some(model[key]),
  write: (model: Model, nextStep: Model[Key]): Model =>
    nextStep === model[key] ? model : { ...model, [key]: nextStep },
})

const personalInfoAt = {
  ...stepAt('personalInfo'),
  toParentMessage: (message: PersonalInfo.Message) => Message.GotPersonalInfoMessage({ message }),
}

const workHistoryAt = {
  ...stepAt('workHistory'),
  toParentMessage: (message: WorkHistory.Message) => Message.GotWorkHistoryMessage({ message }),
}

const educationAt = {
  ...stepAt('education'),
  toParentMessage: (message: Education.Message) => Message.GotEducationMessage({ message }),
}

const skillsAt = {
  ...stepAt('skills'),
  toParentMessage: (message: Skills.Message) => Message.GotSkillsMessage({ message }),
}

const foldPersonalInfo = Update.foldChild({ update: PersonalInfo.update, ...personalInfoAt })

const foldWorkHistory = Update.foldChild({ update: WorkHistory.update, ...workHistoryAt })

const foldEducation = Update.foldChild({ update: Education.update, ...educationAt })

const foldSkills = Update.foldChild({ update: Skills.update, ...skillsAt })

const foldCoverLetter = Update.foldChild({
  update: CoverLetter.update,
  ...stepAt('coverLetter'),
  toParentMessage: message => Message.GotCoverLetterMessage({ message }),
})

const foldAttachments = Update.foldChild({
  update: Attachments.update,
  ...stepAt('attachments'),
  toParentMessage: message => Message.GotAttachmentsMessage({ message }),
})

/**
 * Each step's own reveal, folded like its Messages: a draft not validated yet
 * is, and a well-formed email not yet checked is asked about.
 */
const revealErrors: ReadonlyArray<Update.Step<Model, Message>> = [
  Update.foldChildStep({ update: PersonalInfo.revealErrors, ...personalInfoAt }),
  Update.foldChildStep({ update: WorkHistory.revealErrors, ...workHistoryAt }),
  Update.foldChildStep({ update: Education.revealErrors, ...educationAt }),
  Update.foldChildStep({ update: Skills.revealErrors, ...skillsAt }),
]

const markSubmitAttempted: Update.Step<Model, Message> = model => ({
  model: modifyFields(model, { isSubmitAttempted: () => true }),
})

/**
 * Reveal what was never validated, then send the application as the Model
 * stands. The payload is read once, here, so edits made while the request runs
 * change the Model and not what was sent. A reveal that started a check sends
 * nothing: the policy is "validate, then press Submit again", never a submit
 * that waits for an answer.
 */
const submitApplication = (model: Model): Update.Return<Model, Message> => {
  const revealed = Update.combine(model, [...revealErrors, markSubmitAttempted])
  return Option.match(applicationPayload(revealed.model), {
    onNone: () => revealed,
    onSome: application => ({
      model: modifyFields(revealed.model, { submission: () => Submission.Submitting() }),
      commands: [...(revealed.commands ?? []), SubmitApplication({ application })],
    }),
  })
}

const foldStepMenuOutMessage = Menu.OutMessage.match<
  Update.Step<Model, Message>,
  Menu.OutMessage<Step.Step>
>({
  Selected:
    ({ value }) =>
    model => ({ model: modifyFields(model, { currentStep: () => value }) }),
})

const foldStepMenu = Update.foldChild({
  update: StepMenu.update,
  read: (model: Model) => Option.some(model.stepMenu),
  write: (model, nextStepMenu) => modifyFields(model, { stepMenu: () => nextStepMenu }),
  toParentMessage: message => Message.GotStepMenuMessage({ message }),
  foldOutMessage: foldStepMenuOutMessage,
})

const foldStepTabsOutMessage = Tabs.OutMessage.match<
  Update.Step<Model, Message>,
  Tabs.OutMessage<Step.Step>
>({
  Selected:
    ({ value }) =>
    model => ({ model: modifyFields(model, { currentStep: () => value }) }),
})

const foldStepTabs = Update.foldChild({
  update: StepTabs.update,
  read: (model: Model) => Option.some(model.stepTabs),
  write: (model, nextStepTabs) => modifyFields(model, { stepTabs: () => nextStepTabs }),
  toParentMessage: message => Message.GotStepTabsMessage({ message }),
  foldOutMessage: foldStepTabsOutMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    GotPersonalInfoMessage: ({ message }) => foldPersonalInfo(model, message),

    GotWorkHistoryMessage: ({ message }) => foldWorkHistory(model, message),

    GotEducationMessage: ({ message }) => foldEducation(model, message),

    GotSkillsMessage: ({ message }) => foldSkills(model, message),

    GotCoverLetterMessage: ({ message }) => foldCoverLetter(model, message),

    GotAttachmentsMessage: ({ message }) => foldAttachments(model, message),

    GotStepMenuMessage: ({ message }) => foldStepMenu(model, message),

    GotStepTabsMessage: ({ message }) => foldStepTabs(model, message),

    // Next browses; a step need not be complete to move on from it. The
    // application is validated once, at submit.
    ClickedNext: () => ({
      model: modifyFields(model, { currentStep: toNextStep }),
    }),

    ClickedPrevious: () => ({
      model: modifyFields(model, { currentStep: toPreviousStep }),
    }),

    ToggledPreview: () => ({
      model: modifyFields(model, { isPreviewVisible: isVisible => !isVisible }),
    }),

    ClickedSubmit: () =>
      Submission.match<Update.Return<Model, Message>>(model.submission, {
        NotSubmitted: () => submitApplication(model),
        SubmitSuccess: () => submitApplication(model),
        SubmitError: () => submitApplication(model),
        // A request in flight owns the submit: a second click changes nothing.
        Submitting: () => ({ model }),
      }),

    SucceededSubmitApplication: () => ({
      model: modifyFields(model, {
        submission: () => Submission.SubmitSuccess(),
      }),
    }),

    FailedSubmitApplication: ({ error }) => ({
      model: modifyFields(model, {
        submission: () => Submission.SubmitError({ error }),
      }),
    }),
  })
