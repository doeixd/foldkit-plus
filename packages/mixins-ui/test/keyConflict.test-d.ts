/**
 * Compile-time: `conflict` takes the routes of its own widget, infers their
 * Message at the call without annotation, and takes only the input its view
 * reads. Type-checked, not executed.
 */
import { Behaviors } from 'foldkit-mixins'
import { Option } from 'effect'
import { Command, Menubar, Nav, Tabs, TagsInput, Toolbar, Tour } from '../src/index.js'
import { message, type TestMessage } from './fixture.js'

const { Keys } = Behaviors

const toolbarRoute = Keys.route<undefined, TestMessage>('Open', {
  on: [Keys.chord('F10')],
  handle: () => Option.some(message('Clicked')),
})

const commandRoute: Command.CommandRoute<string, TestMessage> = Keys.route('Clear', {
  on: [Keys.chord('Escape')],
  handle: () => Option.none(),
})

export const toolbar = Toolbar.conflict([toolbarRoute], { orientation: 'vertical' })
export const command = Command.conflict([commandRoute])
export const tour = Tour.conflict([toolbarRoute], { closeOnEscape: false })

// @ts-expect-error a Command's routes read the field's words, not a toolbar's nothing
Toolbar.conflict([commandRoute])

// @ts-expect-error a toolbar's routes read no input, which a Command's route needs
Command.conflict([toolbarRoute])

// @ts-expect-error the orientation is one of two
Toolbar.conflict([toolbarRoute], { orientation: 'diagonal' })

// @ts-expect-error a toolbar's own keys do not depend on a direction
Toolbar.conflict([toolbarRoute], { direction: 'rtl' })

// @ts-expect-error the Menubar reads a direction, not a close key
Menubar.conflict([], { closeOnEscape: false })

// @ts-expect-error the tabs read a close, not a delimiter
Tabs.conflict([], { delimiter: ';' })

// @ts-expect-error the Nav's top row asks for no input
Nav.conflict([], { orientation: 'vertical' })

export const tags = TagsInput.conflict([], { delimiter: ';', direction: 'rtl' })
