/**
 * Compile-time: a mixin cannot name a slot the field lacks, the list holds
 * `File`s, and neither `onChange` nor `onRemove` may answer with a Message the
 * view does not send. Type-checked, not executed.
 */
import { Behavior } from 'foldkit-mixins'
import { defineMessageUnion } from 'foldkit/message'
import { FileInput, FileInputSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const Foreign = defineMessageUnion({ SentElsewhere: {} })

Behavior.forSlots(FileInputSlots)<unknown, never>({
  // @ts-expect-error the field publishes no preview slot
  preview: Behavior.slot({}),
})

const field = {
  id: 'cv',
  label: 'Attach',
  files: [],
  onChange: () => message('Other'),
  onRemove: () => message('Clicked'),
} as const

export const plain = FileInput.view(field, h)

export const received = FileInput.view(
  {
    ...field,
    onChange: files => {
      const first: File | undefined = files[0]
      return first === undefined ? message('Other') : message('Clicked')
    },
    onRemove: (file: File) => message(file.name === '' ? 'Other' : 'Clicked'),
  },
  h,
)

export const notFiles = FileInput.view(
  {
    ...field,
    // @ts-expect-error the list holds files, not their names
    files: ['resume.pdf'],
  },
  h,
)

export const foreignChange = FileInput.view(
  {
    ...field,
    // @ts-expect-error onChange cannot answer with a Message the view does not send
    onChange: () => Foreign.SentElsewhere(),
  },
  h,
)

export const foreignRemove = FileInput.view(
  {
    ...field,
    // @ts-expect-error onRemove cannot answer with a Message the view does not send
    onRemove: () => Foreign.SentElsewhere(),
  },
  h,
)

export const removeByName = FileInput.view(
  {
    ...field,
    // @ts-expect-error onRemove is handed the File, not its name
    onRemove: (name: string) => message(name === '' ? 'Other' : 'Clicked'),
  },
  h,
)

export const noRemove = FileInput.view(
  // @ts-expect-error a chosen file must be removable: onRemove is required
  { id: 'cv', label: 'Attach', files: [], onChange: () => message('Other') },
  h,
)

export const foreignAdded = FileInput.added(
  [],
  // @ts-expect-error a pick is files
  ['resume.pdf'],
)
