import { expectTypeOf } from 'vitest'
import { Uploads, type UploadId } from './keys.test.js'

expectTypeOf(Uploads.remove).parameter(0).toEqualTypeOf<UploadId>()
// @ts-expect-error: a collection with branded keys takes an UploadId, not a string
Uploads.remove('a')
expectTypeOf(Uploads.helpers.set).parameters.toEqualTypeOf<[key: UploadId, count: number]>()
