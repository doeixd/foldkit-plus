import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  GeolocationModel,
  MediaDevicesModel,
  MediaStreamModel,
  PermissionsModel,
} from '../src/device/index.js'
import { SseModel, WebSocketModel } from '../src/net/index.js'

// A bundle's Model is part of the application's, which may be stored or sent:
// what is absent is `Option` in code and `null` in JSON.
describe('an absent error or fix', () => {
  const absent = Option.none()
  const stored = <Model>(
    schema: Schema.Codec<Model, unknown>,
    model: Model,
    keys: ReadonlyArray<string>,
  ) => {
    const json = JSON.parse(JSON.stringify(Schema.encodeSync(schema)(model)))
    for (const key of keys) expect(json[key]).toBeNull()
    expect(Schema.decodeUnknownSync(schema)(json)).toEqual(model)
  }

  it('is null in each Model as JSON, and none again read back', () => {
    stored(WebSocketModel, { url: 'ws://x', status: 'closed', lastError: absent, opened: false }, [
      'lastError',
    ])
    stored(SseModel, { url: 'https://x', status: 'closed', lastError: absent }, ['lastError'])
    stored(GeolocationModel, { status: 'unknown', coords: absent, lastError: absent }, [
      'coords',
      'lastError',
    ])
    stored(MediaDevicesModel, { status: 'unknown', devices: [], lastError: absent }, ['lastError'])
    stored(MediaStreamModel, { status: 'idle', lastError: absent }, ['lastError'])
    stored(PermissionsModel, { states: {}, lastError: absent }, ['lastError'])
  })
})
