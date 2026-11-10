/**
 * Compile-time: the drop zone's Message needs no decoding services, so a
 * parent can hold it (`Bundle.parent` takes `Schema.Codec<Message, unknown>`).
 */
import type { Schema } from 'effect'
import * as UiFileDrop from '@foldkit/ui/fileDrop'
import { FileDrop } from '../src/index.js'

/** What `Bundle.parent` asks of its Message Schema. */
declare const parentMessage: (message: Schema.Codec<unknown, unknown>) => void

parentMessage(FileDrop.Message)

// @ts-expect-error upstream's own Message types its files as Schema<File>, whose decoding services are unknown.
parentMessage(UiFileDrop.Message)

// Upstream's update takes ours as it is.
declare const model: UiFileDrop.Model
UiFileDrop.update(model, FileDrop.Message.DroppedNonFiles())
