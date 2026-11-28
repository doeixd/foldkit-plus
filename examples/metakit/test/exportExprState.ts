import { DatabaseBuild, databaseBuildRules, databaseDefaults } from './exportExprRules.js'

export const databaseState = {
  schema: DatabaseBuild,
  defaults: databaseDefaults,
  rules: databaseBuildRules,
}
