/**
 * Shared Kernel: 跨 Slice 共享的確定性契約與事件型別（支援 1v1 ~ 5v5、模組化坦克機種與地圖主題）。
 * 遵循 VSA 原則：各 feature slice 不直接互相 import 內部實作，僅透過此處型別通訊。
 */

export type TeamId = 'A' | 'B'

export type PlayerId = string

export type TankArchetypeId = 'aegis' | 'goliath' | 'zephyr'

export type MapPresetId =
  | 'harvest_plains'
  | 'volcano_gorge'
  | 'polar_glacier'
  | 'sphinx_steps'
  | 'twin_valley'
  | 'heaven_bridge'
  | 'floating_isles'
  | 'templar_ruins'

export type BulletType = 'MISSILE_STANDARD' | 'MISSILE_HEAVY' | 'MISSILE_PLASMA' | 'MISSILE_RAILGUN'

/** 電腦難度：由弱到強。perfect 為百發百中，hard 為舊版預設（次強） */
export type BotLevel = 'rookie' | 'weak' | 'normal' | 'hard' | 'perfect'

export interface RosterSlot {
  readonly id: PlayerId
  name: string
  team: TeamId
  tankId: TankArchetypeId
  isHost: boolean
  /** 由電腦 AI 操控（僅限單機熱座模式） */
  isBot?: boolean
  /** 電腦難度；未指定時視為 hard */
  botLevel?: BotLevel
  /** 房間「準備完畢」狀態；房主不需要準備，其餘玩家全部準備後房主才能開戰 */
  ready?: boolean
}

export interface FireActionCommand {
  readonly type: 'ACTION_FIRE'
  readonly turnId: number
  readonly playerId: PlayerId
  readonly angle: number
  readonly power: number
  readonly wind: number
  readonly bulletType: BulletType
}

export interface MoveActionCommand {
  readonly type: 'ACTION_MOVE'
  readonly turnId: number
  readonly playerId: PlayerId
  readonly targetX: number
}

export interface SyncHashEvent {
  readonly type: 'SYNC_HASH'
  readonly turnId: number
  readonly stateHash: number
}

export interface PlayerJoinInfoEvent {
  readonly type: 'PLAYER_JOIN_INFO'
  readonly guestName: string
  readonly tankId: TankArchetypeId
}

export interface UpdatePlayerSetupEvent {
  readonly type: 'UPDATE_PLAYER_SETUP'
  readonly playerId: PlayerId
  readonly targetTeam: TeamId
  readonly tankId: TankArchetypeId
  /** 有帶值才更新準備狀態；換隊 / 換車請求不帶此欄位 */
  readonly ready?: boolean
}

export interface LobbyRosterUpdateEvent {
  readonly type: 'LOBBY_ROSTER_UPDATE'
  readonly assignedPlayerId: PlayerId
  readonly mapId: MapPresetId
  readonly roster: RosterSlot[]
}

export interface StartBattleEvent {
  readonly type: 'START_BATTLE'
  readonly seed: number
  readonly initialWind: number
  readonly mapId: MapPresetId
  readonly roster: RosterSlot[]
}

export type ProtocolMessage =
  | FireActionCommand
  | MoveActionCommand
  | SyncHashEvent
  | PlayerJoinInfoEvent
  | UpdatePlayerSetupEvent
  | LobbyRosterUpdateEvent
  | StartBattleEvent
