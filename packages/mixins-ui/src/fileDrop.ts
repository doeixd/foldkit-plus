import type { FileDropAttributes } from '@foldkit/ui/fileDrop'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/**
 * FileDrop is a small Submodel: a `root` drop zone plus its hidden file
 * `input`. The root owns the drag handlers (`dragenter`/`dragleave`/`drop`
 * have no Event tokens, but the resolver still refuses a second owner by
 * event name); the input owns `change` while enabled. A Behavior adding its
 * own handler to one of those is a conflict, not a second silent owner.
 */
export const FileDropSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.Disabled],
  }),
})

/** The file drop's bundles with the attached Mixins applied. */
export type ResolvedFileDrop<Message> = Resolved<FileDropAttributes, typeof FileDropSlots, Message>

/** Resolves the file drop's render groups. */
export const resolve = <Input, Message>(
  render: FileDropAttributes,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedFileDrop<Message> => resolveFor(FileDropSlots, mixins, context)(render)

/** The file drop's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedFileDrop<Message>) => Html,
  ) =>
  (render: FileDropAttributes): Html =>
    draw(resolve(render, mixins, context))
