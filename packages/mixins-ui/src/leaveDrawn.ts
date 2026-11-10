import { Effect } from 'effect'
import * as Command from 'foldkit/command'
import * as Render from 'foldkit/render'
import type { ReturnWithOutMessage } from 'foldkit/update'

/**
 * `result` with the end of a popup's leave read only once the leave is drawn
 * (#400). Upstream ends a leave when the panel's animations settle, read one
 * frame after `leaveEnd` (its `DetectMovementOrAnimationEnd`) starts. The
 * runtime puts off a frame whose Model is behind its queue, so that read could
 * come first, find no fade on a panel not yet marked `data-closed`, and end the
 * leave unseen. After the render's commit, the panel it reads is the one drawn.
 */
export const leaveDrawn = <Model, Message, Out>(
  leaveEnd: { readonly name: string },
  result: ReturnWithOutMessage<Model, Message, Out>,
): ReturnWithOutMessage<Model, Message, Out> => {
  const commands = result.commands ?? []
  const isLeaveEnd = (command: Command.Command<Message>) => command.name === leaveEnd.name
  return commands.some(isLeaveEnd)
    ? {
        ...result,
        commands: commands.map(command =>
          isLeaveEnd(command)
            ? Command.mapEffect(command, effect => Render.afterCommit.pipe(Effect.andThen(effect)))
            : command,
        ),
      }
    : result
}
