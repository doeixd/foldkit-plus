import { FileDrop } from '@foldkit/ui'
import { Array, Match, Number, Option } from 'effect'
import { File, Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import { AttachmentPart, RemoveButtonStyle } from '../../style.js'
import { Button } from '../../view/index.js'
import { Message, type Model } from './attachments.js'

type Slots = SlotBuilders<typeof AttachmentPart.slots, Message>

const BYTES_PER_KB = 1024
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB

const formatFileSize = (bytes: number): string =>
  Match.value(bytes).pipe(
    Match.when(Number.isLessThan(BYTES_PER_KB), () => `${bytes} B`),
    Match.when(Number.isLessThan(BYTES_PER_MB), () => `${(bytes / BYTES_PER_KB).toFixed(1)} KB`),
    Match.orElse(() => `${(bytes / BYTES_PER_MB).toFixed(1)} MB`),
  )

const fileKey = (file: File.File): string =>
  `${File.name(file)}:${File.size(file)}:${file.lastModified}`

const resumeView = (resume: File.File, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.file.attrs(), [
    h.div(slots.fileInfo.attrs(), [
      h.span(slots.fileIcon.attrs(), ['📄']),
      h.div(slots.fileText.attrs(), [
        h.p(slots.fileName.attrs(), [File.name(resume)]),
        h.p(slots.fileSize.attrs(), [formatFileSize(File.size(resume))]),
      ]),
    ]),
    Button.view({ label: 'Remove', style: RemoveButtonStyle, onClick: Message.RemovedResume() }, h),
  ])

const additionalFileView = (
  file: File.File,
  fileIndex: number,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(fileKey(file), slots.file.attrs(), [
    h.div(slots.fileInfo.attrs(), [
      h.span(slots.fileIcon.attrs(), ['📎']),
      h.span(slots.fileName.attrs(), [File.name(file)]),
      h.span(slots.fileSize.attrs(), [formatFileSize(File.size(file))]),
    ]),
    Button.view(
      {
        label: 'Remove',
        style: RemoveButtonStyle,
        onClick: Message.RemovedAdditionalFile({ fileIndex }),
      },
      h,
    ),
  ])

/** A drop zone's face: what to drop, and a hint of what fits. */
const dropZone = (
  attributes: FileDrop.FileDropAttributes,
  title: string,
  hint: string,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.label(slots.dropZone.attrs(attributes.root), [
    h.p(slots.dropTitle.attrs(), [title]),
    h.p(slots.dropHint.attrs(), [hint]),
    // `@foldkit/ui` classes the input `sr-only` inside a ChildAttribute, which
    // replaces any class a Slot adds; the drop zone hides it instead.
    h.input(attributes.input),
  ])

export const AttachmentsView = SlotView.forMessages<Message>()
  .define(AttachmentPart.slots, (model: Model, slots, h) => {
    const { resumeDrop, maybeResume, additionalFilesDrop, additionalFiles } = model

    const resumeSection = h.div(slots.section.attrs(), [
      h.h3(slots.sectionHeading.attrs(), ['Resume (PDF)']),
      Option.match(maybeResume, {
        onNone: () =>
          h.submodel({
            slotId: resumeDrop.id,
            model: resumeDrop,
            view: FileDrop.view,
            viewInputs: {
              accept: ['application/pdf', '.doc', '.docx'],
              toView: attributes =>
                dropZone(
                  attributes,
                  'Drop your resume or click to upload',
                  'PDF, DOC, or DOCX up to 10MB',
                  slots,
                  h,
                ),
            },
            toParentMessage: message => Message.GotResumeDropMessage({ message }),
          }),
        onSome: resume => resumeView(resume, slots, h),
      }),
    ])

    const additionalSection = h.div(slots.section.attrs(), [
      h.h3(slots.sectionHeading.attrs(), ['Additional Files (optional)']),
      h.submodel({
        slotId: additionalFilesDrop.id,
        model: additionalFilesDrop,
        view: FileDrop.view,
        viewInputs: {
          multiple: true,
          toView: attributes =>
            dropZone(
              attributes,
              'Drag and drop files here, or click to browse',
              'Cover letters, certifications, portfolios, etc.',
              slots,
              h,
            ),
        },
        toParentMessage: message => Message.GotAdditionalFilesDropMessage({ message }),
      }),
      ...Array.match(additionalFiles, {
        onEmpty: () => [],
        onNonEmpty: files => [
          h.div(
            slots.files.attrs(),
            files.map((file, fileIndex) => additionalFileView(file, fileIndex, slots, h)),
          ),
        ],
      }),
    ])

    return h.div(slots.attachments.attrs(), [resumeSection, additionalSection])
  })
  .pipe(Style.attach(AttachmentPart.style))

export const view = Submodel.defineView<Model, Message>(AttachmentsView)
