import { Schema } from 'effect'

/** A file's key: 128 random bits the server minted, as lowercase hex. */
export const FileKey = Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}$/))

/**
 * A file the upload route kept: its key, and the name, type and size its
 * uploader declared. The type is a label the route checked against its list,
 * never what a download is served as.
 */
export const FileAsset = Schema.Struct({
  key: FileKey,
  name: Schema.String,
  type: Schema.String,
  size: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
})
export type FileAsset = typeof FileAsset.Type
