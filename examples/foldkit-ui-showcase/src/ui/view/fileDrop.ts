import { Array, Match, Number } from 'effect'
import { File, Submodel } from 'foldkit'

import { FileDrop } from '@foldkit/ui'
import { SlotView, Style } from 'foldkit-mixins'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { FileDropPageSlots, FileDropPageStyle } from '../style/fileDrop.js'

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

const FileDropPage = SlotView.forMessages<UiMessage>()
  .define(FileDropPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['File Drop']),
      h.div(slots.demo.attrs(), [
        h.submodel({
          slotId: model.fileDropBasicDemo.id,
          model: model.fileDropBasicDemo,
          view: FileDrop.view,
          viewInputs: {
            multiple: true,
            toView: attributes =>
              h.label(slots.dropZone.attrs(attributes.root), [
                h.p(slots.primaryText.attrs(), ['Drop files or click to browse']),
                h.p(slots.secondaryText.attrs(), ['Any file type. This demo just lists them.']),
                h.input(slots.fileInput.attrs(attributes.input)),
              ]),
          },
          toParentMessage: message => UiMessage.GotFileDropBasicDemoMessage({ message }),
        }),
        ...Array.match(model.fileDropBasicDemoFiles, {
          onEmpty: () => [],
          onNonEmpty: files =>
            files.map((file, fileIndex) =>
              h.keyed('div')(fileKey(file), slots.fileRow.attrs(), [
                h.div(slots.fileText.attrs(), [
                  h.span(slots.fileName.attrs(), [File.name(file)]),
                  h.span(slots.fileSize.attrs(), [formatFileSize(File.size(file))]),
                ]),
                h.button(
                  slots.removeButton.attrs([
                    h.Type('button'),
                    h.OnClick(UiMessage.ClickedRemoveFileDropDemoFile({ fileIndex })),
                  ]),
                  ['Remove'],
                ),
              ]),
            ),
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(FileDropPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(FileDropPage)
