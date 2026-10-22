/**
 * Shared Kernel: 跨 Slice 共享的確定性契約與事件型別（支援 1v1 ~ 5v5、模組化坦克機種與地圖主題）。
 * 遵循 VSA 原則：各 feature slice 不直接互相 import 內部實作，僅透過此處型別通訊。
 */

export type TeamId = 'A' | 'B'

export type PlayerId = string

/** 機種 id：由 battle/domain/tanks/<id>.ts 的檔案決定（自動收集），型別不另列字面值；一致性由 registry.test.ts 守住 */
export type TankArchetypeId = string

export const MAP_PRESET_IDS = [
  'harvest_plains',
  'volcano_gorge',
  'gale_coast',
  'sphinx_steps',
  'twin_valley',
  'heaven_bridge',
  'floating_isles',
  'templar_ruins',
] as const

export type MapPresetId = (typeof MAP_PRESET_IDS)[number]

/** 砲彈 id：由 battle/domain/projectiles/<name>.ts 的檔案決定（自動收集），型別不另列字面值 */
export type BulletType = string

/** 電腦難度：由弱到強。perfect 為百發百中，hard 為舊版預設（次強） */
export type BotLevel = 'rookie' | 'weak' | 'normal' | 'hard' | 'perfect'

/** 對戰中玩家斷線時的處置（開房時由房主決定）：認輸（坦克陣亡）或由電腦接手 */
export type DisconnectPolicy = 'forfeit' | 'bot'

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
  /** 本場帶上場的主彈、副彈（明牌）：單機熱座與電腦使用；連線對戰為了迷霧不會放這裡 */
  loadout?: BulletType[]
  /** 連線對戰的彈藥承諾（主彈、副彈兩個葉子雜湊合成的 Merkle 根）；開戰後不可更改，開火時用 `reveal` 證明 */
  loadoutRoot?: string
}

/** 開火時對「彈藥承諾」的揭露：只揭露本次使用的那一格，另一格只給葉子雜湊，不洩漏砲彈 */
export interface LoadoutReveal {
  /** 0 = 主彈、1 = 副彈 */
  readonly slot: number
  /** 該格專屬的隨機鹽（hex） */
  readonly salt: string
  /** 另一格的葉子雜湊（hex） */
  readonly sibling: string
}

export interface FireActionCommand {
  readonly type: 'ACTION_FIRE'
  readonly turnId: number
  readonly playerId: PlayerId
  readonly angle: number
  readonly power: number
  readonly wind: number
  readonly bulletType: BulletType
  /** 連線對戰中證明 `bulletType` 屬於開戰前承諾的彈藥；單機與電腦不需要 */
  readonly reveal?: LoadoutReveal
}

export interface MoveActionCommand {
  readonly type: 'ACTION_MOVE'
  readonly turnId: number
  readonly playerId: PlayerId
  readonly targetX: number
}

export interface PassActionCommand {
  readonly type: 'ACTION_PASS'
  readonly turnId: number
  readonly playerId: PlayerId
}

export interface SyncHashEvent {
  readonly type: 'SYNC_HASH'
  readonly turnId: number
  readonly stateHash: number
}

/** 客端偵測到狀態雜湊不一致，請房主重送權威狀態 */
export interface ResyncRequestEvent {
  readonly type: 'RESYNC_REQUEST'
  readonly turnId: number
}

/** 房主的權威狀態快照：回合狀態 JSON + 地形挖坑紀錄（[x, y, r] 攤平），客端重建地形後覆寫本地狀態 */
export interface ResyncStateEvent {
  readonly type: 'RESYNC_STATE'
  readonly turnId: number
  readonly snapshot: string
  readonly carves: number[]
}

/** 對戰中玩家斷線（只由房主廣播）：依房間設定認輸（坦克陣亡並退出出手順序）或交給電腦接手 */
export interface PlayerLeftEvent {
  readonly type: 'PLAYER_LEFT'
  readonly playerId: PlayerId
  /** true = 由房主端的電腦接手該坦克；false = 認輸陣亡。由房主依房間設定決定，客端照辦 */
  readonly takeover: boolean
}

export interface PlayerJoinInfoEvent {
  readonly type: 'PLAYER_JOIN_INFO'
  readonly guestName: string
  readonly tankId: TankArchetypeId
  readonly loadoutRoot?: string
}

export interface UpdatePlayerSetupEvent {
  readonly type: 'UPDATE_PLAYER_SETUP'
  readonly playerId: PlayerId
  readonly targetTeam: TeamId
  readonly tankId: TankArchetypeId
  /** 有帶值才更新準備狀態；換隊 / 換車請求不帶此欄位 */
  readonly ready?: boolean
  /** 有帶值才更新彈藥承諾（換車或重選彈藥時） */
  readonly loadoutRoot?: string
}

export interface LobbyRosterUpdateEvent {
  readonly type: 'LOBBY_ROSTER_UPDATE'
  readonly assignedPlayerId: PlayerId
  readonly mapId: MapPresetId
  readonly disconnectPolicy?: DisconnectPolicy
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
  | PassActionCommand
  | SyncHashEvent
  | ResyncRequestEvent
  | PlayerLeftEvent
  | ResyncStateEvent
  | PlayerJoinInfoEvent
  | UpdatePlayerSetupEvent
  | LobbyRosterUpdateEvent
  | StartBattleEvent
