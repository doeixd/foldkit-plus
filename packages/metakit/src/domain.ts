/**
 * Domain Schemas & symbolic ops (`metakit/domain`):
 *   - `Money` (fixed-scale integer minor units + compile-time currency safety)
 *   - `CalendarDay` (timezone-free epoch days)
 *   - `OrderedEnum` (totally ordered string literal enums lowered to integer ranks)
 *   - `Domain` annotation reader (`domainOf`)
 */
export * as Domain from './domain/annotation.js'
export * as Money from './domain/money.js'
export * as CalendarDay from './domain/calendarDay.js'
export * as OrderedEnum from './domain/orderedEnum.js'
