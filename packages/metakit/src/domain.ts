/**
 * Domain Schemas & symbolic ops (`metakit/domain`):
 *   - `Money` (fixed-scale integer minor units + compile-time currency safety)
 *   - `Decimal` (fixed-scale integer units + compile-time scale safety + half-even rounding)
 *   - `CalendarDay` (timezone-free epoch days)
 *   - `OrderedEnum` (totally ordered string literal enums lowered to integer ranks)
 *   - `Text` (text holding no NUL, which the checkers can prove rules over)
 *   - `Domain` annotation reader (`domainOf`)
 */
export * as Domain from './domain/annotation.js'
export * as Decimal from './domain/decimal.js'
export * as Money from './domain/money.js'
export * as CalendarDay from './domain/calendarDay.js'
export * as OrderedEnum from './domain/orderedEnum.js'
export * as Text from './domain/text.js'
