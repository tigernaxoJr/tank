/**
 * Tank Artillery Web — Lightweight PeerJS Signaling Server + Room Directory
 * - 信令：僅負責玩家進房 WebRTC SDP/ICE 握手交換，不處理遊戲物理、不中繼對戰即時封包。
 * - 房間目錄：`/rooms` 提供「等待中 / 遊戲中」房間清單（見 roomDirectory.js），與信令共用同一個連接埠。
 */
import http from 'node:http'
import express from 'express'
import { ExpressPeerServer } from 'peer'
import { createRoomDirectory, createRoomsRouter } from './roomDirectory.js'

const PORT = Number(process.env.PORT || 9000)
const PATH = process.env.PEER_PATH || '/signaling'
const KEY = process.env.PEER_KEY || 'peerjs'
const ALLOW_DISCOVERY = process.env.ALLOW_DISCOVERY === 'true'
const ROOMS_PATH = process.env.ROOMS_PATH || '/rooms'
const ROOMS_TTL_MS = Number(process.env.ROOMS_TTL_MS || 30_000)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

const app = express()
app.set('trust proxy', true)
app.disable('x-powered-by')

const directory = createRoomDirectory({ ttlMs: ROOMS_TTL_MS })
app.use(ROOMS_PATH, express.json({ limit: '2kb' }), createRoomsRouter(directory, { allowedOrigin: ALLOWED_ORIGIN }))
// JSON 解析失敗（過大或格式錯誤）一律回 400，不洩漏堆疊
app.use(ROOMS_PATH, (err, _req, res, _next) => {
  res.status(err?.status === 413 ? 413 : 400).json({ error: 'bad request' })
})

const server = http.createServer(app)
const peerjs = ExpressPeerServer(server, {
  path: PATH,
  key: KEY,
  allow_discovery: ALLOW_DISCOVERY,
  proxied: true,
})
app.use(peerjs)

peerjs.on('connection', (client) => {
  console.log(`[Signaling] Peer connected: ${client.getId()}`)
})

peerjs.on('disconnect', (client) => {
  console.log(`[Signaling] Peer disconnected: ${client.getId()}`)
})

server.listen(PORT, () => {
  console.log(
    `[Signaling] Tank Artillery PeerJS server listening on port ${PORT} (path: ${PATH}, key: ${KEY}, rooms: ${ROOMS_PATH})`,
  )
})
