/**
 * Presets bind their args, so placements give none, and every preset keeps
 * the bundle's name for keys and the Module.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { expectTypeOf } from 'vitest'
import { Bundle } from 'foldkit-bundle'
import { MediaQuery, PrefersDark } from '../src/media/index.js'

expectTypeOf(MediaQuery.name).toEqualTypeOf<'MediaQuery'>()
expectTypeOf(PrefersDark.name).toEqualTypeOf<'MediaQuery'>()

const Dark = Bundle.declare(MediaQuery, 'dark')
const Model = Schema.Struct({ ...Dark.fields, theme: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ThemeSet: { theme: Schema.String } })
const Page = Bundle.parent({ Model, Message })

// A preset places with no config at all.
const placed = Page.place(PrefersDark, 'dark')
expectTypeOf(placed.key).toEqualTypeOf<string>()

// The bundle takes args, so a placement gives them:
// @ts-expect-error: args is required
Page.at(Dark)

// @ts-expect-error: the query is a string
Page.at(Dark, { args: { query: 42 } })
