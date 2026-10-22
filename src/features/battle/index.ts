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
export { TANK_REGISTRY, TANK_LIST, getTankSpec, tankAt, type TankBlueprint } from './domain/tankRegistry'
export {
  LOADOUT_SIZE,
  availableShots,
  createLoadoutSecret,
  defaultLoadout,
  loadoutRoot,
  revealFor,
  sanitizeLoadout,
  verifyReveal,
  type LoadoutSecret,
} from './domain/loadout'
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
  getProjectileSpec,
  type ProjectileBlueprint,
  type ProjectileFx,
  type GlowKey,
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
export {
  emitBattleSound,
  onBattleSound,
  setupBattleSoundBridge,
  type BattleSoundEvent,
} from './domain/battleEvents'
