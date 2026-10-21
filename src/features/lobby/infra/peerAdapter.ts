/**
 * Lobby Slice - Infrastructure Adapter (PeerJS WebRTC Star Topology)
 * 支援最多 5v5 (10 人房間：1 Host + 最多 9 Clients)：
 * - 彈性信令伺服器切換 (`getPeerConfig()`)：
 *   - 若設定 `VITE_PEER_HOST`，優先連線至自建專用 PeerJS 信令伺服器。
 *   - 若未設定，開箱即用連線至 PeerJS 官方公共信令伺服器。
 *   - 若自建信令伺服器離線且 `VITE_PEER_FALLBACK_PUBLIC !== 'false'`，自動平滑回退至官方公共伺服器。
 * - 支援透過環境變數擴充 STUN / TURN ICE 伺服器配置。
 * - 撞號防護：開房遇 `unavailable-id` 自動重試新房號。
 * - 防亂入防護：房間人數達上限 (9 位連線客機) 或鎖房開戰 (`lockRoom()`) 後，拒絕任何新連入並踢除信令註冊。
 * - 星狀廣播：Host 維護 `Map<PlayerId, DataConnection>`，支援單點發送與全員廣播。
 */
import Peer, { type DataConnection, type PeerJSOption } from 'peerjs'
import type { PlayerId, ProtocolMessage } from '@/shared/kernel/types'
import { generateRoomCode } from '../domain/roomSession'

export type SignalingEndpointMode = 'custom' | 'public' | 'fallback-public'

export interface SignalingEndpointInfo {
  mode: SignalingEndpointMode
  label: string
  host: string
}

export interface HostCallbacks {
  onPeerConnected: (peerSlotId: PlayerId) => void
  onPeerMessage: (peerSlotId: PlayerId, msg: ProtocolMessage) => void
  onPeerDisconnected: (peerSlotId: PlayerId) => void
  onSignalingChanged?: (info: SignalingEndpointInfo) => void
}

export interface ClientCallbacks {
  onConnected: () => void
  onMessage: (msg: ProtocolMessage) => void
  onDisconnected: (reason?: string) => void
  onSignalingChanged?: (info: SignalingEndpointInfo) => void
}

export interface PeerTransportPort {
  hostRoomWithRetry(
    initialCode: string,
    callbacks: HostCallbacks,
    maxRetries?: number,
  ): Promise<string>
  joinRoom(roomCode: string, callbacks: ClientCallbacks): Promise<void>
  sendToPeer(peerSlotId: PlayerId, msg: ProtocolMessage): void
  broadcast(msg: ProtocolMessage, excludePeerSlotId?: PlayerId): void
  sendToHost(msg: ProtocolMessage): void
  lockRoom(): void
  disconnect(): void
  getSignalingInfo(): SignalingEndpointInfo
}

const MAX_REMOTE_PEERS = 9 // 1 Host + 9 Guests = 10 players (5v5)

export interface ResolvedPeerConfig {
  hasCustomServer: boolean
  allowPublicFallback: boolean
  customEndpointLabel: string
  customOptions: PeerJSOption
  publicOptions: PeerJSOption
  /** 房間目錄 API 的根網址（由自建信令伺服器推導，例如 https://host/rooms）；null 代表沒有自建伺服器，大廳不啟用房間列表 */
  directoryBaseUrl: string | null
}

/**
 * 讀取 Vite 環境變數並組裝 PeerJS 連線設定（含 STUN / TURN 擴充與公共伺服器 Fallback 設定）
 */
export function getPeerConfig(): ResolvedPeerConfig {
  const env = import.meta.env || {}

  // 1. 組裝 ICE (STUN + 選填 TURN) 伺服器清單
  const rawStunUrls = (env.VITE_STUN_URLS || '').trim()
  const stunUrls = rawStunUrls
    ? rawStunUrls
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']

  const iceServers: RTCIceServer[] = stunUrls.map((urls) => ({ urls }))

  const turnUrl = (env.VITE_TURN_URL || '').trim()
  if (turnUrl) {
    const turnEntry: RTCIceServer = { urls: turnUrl }
    if (env.VITE_TURN_USERNAME) {
      turnEntry.username = env.VITE_TURN_USERNAME.trim()
    }
    if (env.VITE_TURN_CREDENTIAL) {
      turnEntry.credential = env.VITE_TURN_CREDENTIAL.trim()
    }
    iceServers.push(turnEntry)
  }

  const publicOptions: PeerJSOption = {
    config: { iceServers },
  }

  // 2. 檢查是否配置了自建輕量信令伺服器 (VITE_PEER_HOST)
  const customHost = (env.VITE_PEER_HOST || '').trim()
  const hasCustomServer = customHost.length > 0
  const allowPublicFallback = (env.VITE_PEER_FALLBACK_PUBLIC || 'true').toLowerCase() !== 'false'

  // 房間目錄只在「有設定自建信令伺服器」時啟用（公共信令伺服器沒有 /rooms API）
  if (!hasCustomServer) {
    return {
      hasCustomServer: false,
      allowPublicFallback: true,
      customEndpointLabel: 'PeerJS 官方公共信令',
      customOptions: publicOptions,
      publicOptions,
      directoryBaseUrl: null,
    }
  }

  const secure =
    env.VITE_PEER_SECURE !== undefined
      ? env.VITE_PEER_SECURE.toLowerCase() === 'true'
      : customHost !== 'localhost' && customHost !== '127.0.0.1'

  const port = env.VITE_PEER_PORT ? Number(env.VITE_PEER_PORT) : secure ? 443 : 9000
  const path = (env.VITE_PEER_PATH || '/signaling').trim()
  const key = (env.VITE_PEER_KEY || 'peerjs').trim()

  const customOptions: PeerJSOption = {
    host: customHost,
    port,
    path,
    secure,
    key,
    config: { iceServers },
  }

  const defaultPort = secure ? 443 : 80
  const roomsPath = (env.VITE_ROOMS_PATH || '/rooms').trim()
  const derivedRoomsUrl = `${secure ? 'https' : 'http'}://${customHost}${port === defaultPort ? '' : `:${port}`}${roomsPath}`

  return {
    hasCustomServer: true,
    allowPublicFallback,
    customEndpointLabel: `${customHost}:${port}${path}`,
    customOptions,
    publicOptions,
    directoryBaseUrl: derivedRoomsUrl,
  }
}

function isSignalingServerReachabilityError(errMsg: string): boolean {
  const lower = errMsg.toLowerCase()
  return (
    lower.includes('network') ||
    lower.includes('server-error') ||
    lower.includes('socket-error') ||
    lower.includes('socket-closed') ||
    lower.includes('lost connection to server') ||
    lower.includes('could not connect to peer')
  )
}

export class PeerJsAdapter implements PeerTransportPort {
  private peer: Peer | null = null
  private hostConn: DataConnection | null = null
  private clientConns = new Map<PlayerId, DataConnection>()
  private nextSlotCounter = 2
  private isLocked = false
  private resolvedConfig: ResolvedPeerConfig = getPeerConfig()
  private currentSignalingInfo: SignalingEndpointInfo

  constructor() {
    this.currentSignalingInfo = this.resolvedConfig.hasCustomServer
      ? {
          mode: 'custom',
          label: `自建信令 (${this.resolvedConfig.customEndpointLabel})`,
          host: this.resolvedConfig.customEndpointLabel,
        }
      : {
          mode: 'public',
          label: '公共信令池 (PeerJS Cloud)',
          host: '0.peerjs.com',
        }
  }

  getSignalingInfo(): SignalingEndpointInfo {
    return this.currentSignalingInfo
  }

  private setSignalingMode(mode: SignalingEndpointMode): SignalingEndpointInfo {
    if (mode === 'custom') {
      this.currentSignalingInfo = {
        mode: 'custom',
        label: `自建信令 (${this.resolvedConfig.customEndpointLabel})`,
        host: this.resolvedConfig.customEndpointLabel,
      }
    } else if (mode === 'fallback-public') {
      this.currentSignalingInfo = {
        mode: 'fallback-public',
        label: '公共信令池 (自建信令離線已自動回退)',
        host: '0.peerjs.com',
      }
    } else {
      this.currentSignalingInfo = {
        mode: 'public',
        label: '公共信令池 (PeerJS Cloud)',
        host: '0.peerjs.com',
      }
    }
    return this.currentSignalingInfo
  }

  private toPeerId(roomCode: string): string {
    return `tank-artillery-${roomCode}`
  }

  async hostRoomWithRetry(
    initialCode: string,
    callbacks: HostCallbacks,
    maxRetries = 4,
  ): Promise<string> {
    const useCustomFirst = this.resolvedConfig.hasCustomServer
    let usingPublicFallback = false

    let candidateCode = initialCode
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const options =
        useCustomFirst && !usingPublicFallback
          ? this.resolvedConfig.customOptions
          : this.resolvedConfig.publicOptions

      const info = this.setSignalingMode(
        useCustomFirst
          ? usingPublicFallback
            ? 'fallback-public'
            : 'custom'
          : 'public',
      )
      callbacks.onSignalingChanged?.(info)

      try {
        await this.tryOpenHostPeer(candidateCode, options, callbacks)
        return candidateCode
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)

        // 若房號在當前信令池撞號，重抽新房號重試
        if (msg.includes('unavailable-id') && attempt < maxRetries) {
          candidateCode = generateRoomCode()
          continue
        }

        // 若自建信令伺服器離線/連不上：允許自動 Fallback 至官方公共信令池，或提示清楚錯誤
        if (useCustomFirst && !usingPublicFallback && isSignalingServerReachabilityError(msg)) {
          if (this.resolvedConfig.allowPublicFallback) {
            usingPublicFallback = true
            attempt = -1 // 重置重試次數並改用公共池
            continue
          }
          throw new Error(
            `無法連線至自建信令伺服器 (${this.resolvedConfig.customEndpointLabel})，請確認服務是否啟動`,
          )
        }

        throw err
      }
    }
    throw new Error('無法取得可用房號，請稍後再試')
  }

  private tryOpenHostPeer(
    roomCode: string,
    options: PeerJSOption,
    callbacks: HostCallbacks,
  ): Promise<void> {
    this.disconnect()
    this.isLocked = false
    this.nextSlotCounter = 2

    return new Promise<void>((resolve, reject) => {
      const peer = new Peer(this.toPeerId(roomCode), options)
      this.peer = peer

      let settled = false
      const openTimeoutId = setTimeout(() => {
        if (!settled) {
          settled = true
          this.disconnect()
          reject(new Error('network: 信令伺服器連線逾時'))
        }
      }, 6000)

      peer.once('open', () => {
        if (!settled) {
          settled = true
          clearTimeout(openTimeoutId)
          resolve()
        }
      })

      peer.on('error', (err) => {
        const errType = (err as { type?: string })?.type || ''
        const msg = errType ? `${errType}: ${err.message}` : err?.message || String(err)
        if (!settled) {
          settled = true
          clearTimeout(openTimeoutId)
          reject(new Error(msg))
        }
      })

      peer.on('connection', (conn) => {
        // 防亂入守門：若已開戰鎖房，或房間已滿 10 人（9 位遠端玩家），立即關閉拒絕該連線
        if (this.isLocked || this.clientConns.size >= MAX_REMOTE_PEERS) {
          conn.on('open', () => conn.close())
          setTimeout(() => conn.close(), 100)
          return
        }

        const slotId: PlayerId = `p${this.nextSlotCounter++}`
        this.clientConns.set(slotId, conn)

        const markReady = () => {
          callbacks.onPeerConnected(slotId)
        }

        if (conn.open) {
          markReady()
        } else {
          conn.once('open', markReady)
        }

        conn.on('data', (data) => {
          callbacks.onPeerMessage(slotId, data as ProtocolMessage)
        })

        conn.on('close', () => {
          if (this.clientConns.has(slotId)) {
            this.clientConns.delete(slotId)
            callbacks.onPeerDisconnected(slotId)
          }
        })

        conn.on('error', () => {
          if (this.clientConns.has(slotId)) {
            this.clientConns.delete(slotId)
            callbacks.onPeerDisconnected(slotId)
          }
        })
      })
    })
  }

  async joinRoom(roomCode: string, callbacks: ClientCallbacks): Promise<void> {
    const useCustomFirst = this.resolvedConfig.hasCustomServer

    if (useCustomFirst) {
      const info = this.setSignalingMode('custom')
      callbacks.onSignalingChanged?.(info)
      try {
        await this.tryJoinRoomWithOptions(roomCode, this.resolvedConfig.customOptions, callbacks)
        return
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        if (isSignalingServerReachabilityError(msg)) {
          if (this.resolvedConfig.allowPublicFallback) {
            const fallbackInfo = this.setSignalingMode('fallback-public')
            callbacks.onSignalingChanged?.(fallbackInfo)
            await this.tryJoinRoomWithOptions(
              roomCode,
              this.resolvedConfig.publicOptions,
              callbacks,
            )
            return
          }
          throw new Error(
            `自建信令伺服器 (${this.resolvedConfig.customEndpointLabel}) 離線或無法連線`,
          )
        }
        throw err
      }
    }

    const info = this.setSignalingMode('public')
    callbacks.onSignalingChanged?.(info)
    await this.tryJoinRoomWithOptions(roomCode, this.resolvedConfig.publicOptions, callbacks)
  }

  private tryJoinRoomWithOptions(
    roomCode: string,
    options: PeerJSOption,
    callbacks: ClientCallbacks,
  ): Promise<void> {
    this.disconnect()

    return new Promise<void>((resolve, reject) => {
      const peer = new Peer(options)
      this.peer = peer

      let settled = false
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true
          this.disconnect()
          reject(new Error('連線逾時：找不到該房號、房間已滿或對戰已開始'))
        }
      }, 10000)

      peer.on('error', (err) => {
        const errType = (err as { type?: string })?.type || ''
        const msg = errType ? `${errType}: ${err.message}` : err?.message || String(err)
        if (!settled) {
          settled = true
          clearTimeout(timeoutId)
          reject(
            new Error(
              msg.includes('peer-unavailable')
                ? '找不到該房號（或房主已開戰鎖定房間）'
                : msg,
            ),
          )
        } else {
          callbacks.onDisconnected(msg)
        }
      })

      peer.once('open', () => {
        const conn = peer.connect(this.toPeerId(roomCode), { reliable: true })
        this.hostConn = conn

        conn.on('error', (err) => {
          if (!settled) {
            settled = true
            clearTimeout(timeoutId)
            reject(err)
          }
        })

        const onOpen = () => {
          if (!settled) {
            settled = true
            clearTimeout(timeoutId)
            callbacks.onConnected()
            resolve()
          }
        }

        if (conn.open) {
          onOpen()
        } else {
          conn.once('open', onOpen)
        }

        conn.on('data', (data) => {
          callbacks.onMessage(data as ProtocolMessage)
        })

        conn.on('close', () => {
          if (this.hostConn === conn) {
            this.hostConn = null
            callbacks.onDisconnected('與房主的連線已關閉（或房間人數已滿）')
          }
        })
      })
    })
  }

  sendToPeer(peerSlotId: PlayerId, msg: ProtocolMessage): void {
    const conn = this.clientConns.get(peerSlotId)
    if (conn && conn.open) {
      conn.send(msg)
    }
  }

  broadcast(msg: ProtocolMessage, excludePeerSlotId?: PlayerId): void {
    for (const [slotId, conn] of this.clientConns.entries()) {
      if (slotId !== excludePeerSlotId && conn.open) {
        conn.send(msg)
      }
    }
  }

  sendToHost(msg: ProtocolMessage): void {
    if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(msg)
    }
  }

  /**
   * 房主按下開戰後鎖定房間，並從信令伺服器斷開註冊（保留現有 P2P WebRTC 連線），
   * 徹底防止外部陌生人在對戰途中透過房號連入。
   */
  lockRoom(): void {
    this.isLocked = true
    if (this.peer && !this.peer.disconnected) {
      this.peer.disconnect()
    }
  }

  disconnect(): void {
    this.isLocked = false
    for (const conn of this.clientConns.values()) {
      conn.close()
    }
    this.clientConns.clear()

    if (this.hostConn) {
      const conn = this.hostConn
      this.hostConn = null
      conn.close()
    }

    if (this.peer) {
      const p = this.peer
      this.peer = null
      p.destroy()
    }
  }
}

export function createPeerTransport(): PeerTransportPort {
  return new PeerJsAdapter()
}
