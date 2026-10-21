export { default as BattleArena } from './ui/BattleArena.vue'
export {
  createInitialBattleState,
  advanceTurn,
  syncTankToSurface,
  applyDamageAndCheckWinner,
  launchVelocity,
  fallDamageFor,
  type BattleState,
  type TankEntity,
  type TurnPhase,
} from './domain/battleState'
export { TANK_REGISTRY, TANK_LIST, type TankBlueprint } from './domain/tankRegistry'
export { buildTankCard, type ShotCard, type TankCard } from './domain/tankStats'
export {
  MAP_REGISTRY,
  MAP_LIST,
  mapAssetUrl,
  terrainOptionsFor,
  THEME_REGISTRY,
  generatedAssetUrl,
  hasAbyss,
  type MapBlueprint,
  type MapThemeId,
  type MapTheme,
} from './domain/mapRegistry'
export { renderMapPreview } from './ui/mapPreview'
export {
  PROJECTILE_REGISTRY,
  PROJECTILE_LIST,
  type ProjectileBlueprint,
  type ProjectileTrailStyle,
} from './domain/projectileRegistry'
export {
  executeFireAction,
  prepareFireTrajectory,
  commitFireImpact,
  finalizeTurnAfterHold,
  moveActiveTank,
  syncAllTanksToTerrain,
  type ImpactResult,
  type PreparedShotPlan,
} from './application/useBattleTurn'
export { BOT_LEVEL_SPECS, planBotMove, planBotShot, type BotShotPlan } from './domain/botBrain'
