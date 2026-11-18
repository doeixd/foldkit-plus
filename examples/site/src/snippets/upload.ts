/**
 * A transport that sends nothing: it reports a file as arriving in ten
 * steps over about two seconds, then as uploaded. An application's own
 * (`fetch`, a signed URL, `foldkit-media`) has the same shape: one job in, a
 * Stream of the FileUpload's `Progressed`, `Succeeded` and `Failed` out.
 * A file whose name holds `fail` fails at the halfway step, once: its retry
 * goes through.
 */
import { Effect, Option, Stream } from 'effect'
import { FileUpload } from 'foldkit-mixins-ui'

const STEPS = 10

export const simulated = (job: FileUpload.Job): Stream.Stream<FileUpload.Message> => {
  const { id, attempt } = job
  const total = job.file.size
  const fails = job.file.name.includes('fail') && attempt === 1
  const steps = Array.from({ length: fails ? STEPS / 2 : STEPS }, (_, at) => at + 1)
  return Stream.fromIterable(steps).pipe(
    Stream.mapEffect(step =>
      Effect.sleep('200 millis').pipe(
        Effect.as(
          FileUpload.Message.Progressed({
            id,
            attempt,
            loaded: Math.round((total * step) / STEPS),
            total,
          }),
        ),
      ),
    ),
    Stream.concat(
      Stream.succeed(
        fails
          ? FileUpload.Message.Failed({
              id,
              attempt,
              reason: 'the connection dropped',
              retryable: true,
            })
          : FileUpload.Message.Succeeded({ id, attempt, url: Option.none() }),
      ),
    ),
  )
}
