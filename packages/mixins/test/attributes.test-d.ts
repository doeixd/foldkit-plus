/**
 * Compile-time Attributes contract. Type-checked, not executed.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Attributes, SlotView, type SlotAttributes } from '../src/index.js'
import type { TestMessage } from './resolverFixture.js'

declare const bundle: SlotAttributes<TestMessage>

const _class: string | undefined = Attributes.find(bundle, 'Class')?.value
const _message: TestMessage | undefined = Attributes.find(bundle, 'OnClick')?.message
const _key: string | undefined = Attributes.filter(bundle, 'DataAttribute')[0]?.key
void _class
void _message
void _key

// @ts-expect-error an unknown tag is rejected.
Attributes.find(bundle, 'Klass')

// @ts-expect-error an unknown tag is rejected.
Attributes.filter(bundle, 'Klass')

// @ts-expect-error a found variant carries only its own fields.
void Attributes.find(bundle, 'Class')?.message

const _builder: HtmlBuilder<TestMessage> = SlotView.inertBuilder<TestMessage>()
void _builder

// @ts-expect-error the builder is typed for its Message universe.
const _wrong: HtmlBuilder<{ readonly _tag: 'Else' }> = SlotView.inertBuilder<TestMessage>()
void _wrong
