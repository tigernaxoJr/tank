import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRateLimiter, createRoomDirectory, validateRoomBody } from './roomDirectory.js'

const body = { name: '測試房', hostName: 'Ann', mapId: 'emerald_valley', players: 2, maxPlayers: 10, status: 'waiting' }

test('validateRoomBody rejects bad input and cleans text', () => {
  assert.ok(validateRoomBody('abc', body).error)
  assert.ok(validateRoomBody('ABC234', { ...body, mapId: '../x' }).error)
  assert.equal(validateRoomBody('ABC234', body).room.disconnectPolicy, 'forfeit')
  assert.equal(validateRoomBody('ABC234', { ...body, disconnectPolicy: 'bot' }).room.disconnectPolicy, 'bot')
  assert.ok(validateRoomBody('ABC234', { ...body, disconnectPolicy: 'x' }).error)
  assert.ok(validateRoomBody('ABC234', { ...body, players: 11 }).error)
  assert.ok(validateRoomBody('ABC234', { ...body, status: 'hacked' }).error)
  const ok = validateRoomBody('ABC234', { ...body, name: '<b>hi</b>\n' })
  assert.equal(ok.room.name, 'bhi/b')
  assert.equal(validateRoomBody('ABC234', { ...body, name: '   ' }).room.name, '房間 ABC234')
})

test('token protects update and delete', () => {
  const dir = createRoomDirectory()
  const { room } = validateRoomBody('ABC234', body)
  const { token } = dir.upsert('ABC234', room, '')
  assert.ok(token)
  assert.equal(dir.upsert('ABC234', room, 'wrong').status, 403)
  assert.equal(dir.remove('ABC234', 'wrong').status, 403)
  assert.equal(dir.upsert('ABC234', { ...room, players: 3 }, token).token, token)
  assert.equal(dir.list()[0].players, 3)
  assert.ok(dir.remove('ABC234', token).ok)
  assert.equal(dir.list().length, 0)
})

test('rooms expire without heartbeat and waiting rooms sort first', () => {
  let t = 0
  const dir = createRoomDirectory({ ttlMs: 30_000, now: () => t })
  const mk = (code, status) => validateRoomBody(code, { ...body, status }).room
  dir.upsert('AAAAAA', mk('AAAAAA', 'playing'), '')
  t = 1000
  const b = dir.upsert('BBBBBB', mk('BBBBBB', 'waiting'), '')
  assert.deepEqual(dir.list().map((r) => r.code), ['BBBBBB', 'AAAAAA'])
  t = 30_500 // AAAAAA（t=0 註冊）已逾時，BBBBBB（t=1000 註冊）還在
  assert.deepEqual(dir.list().map((r) => r.code), ['BBBBBB'])
  t = 70_000
  assert.equal(dir.list().length, 0)
  assert.ok(b.token)
})

test('directory enforces max rooms and rate limiter blocks bursts', () => {
  const dir = createRoomDirectory({ maxRooms: 1 })
  dir.upsert('AAAAAA', validateRoomBody('AAAAAA', body).room, '')
  assert.equal(dir.upsert('BBBBBB', validateRoomBody('BBBBBB', body).room, '').status, 503)
  const allow = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 })
  assert.deepEqual([1, 2, 3, 4].map(() => allow('1.1.1.1')), [true, true, true, false])
  assert.equal(allow('2.2.2.2'), true)
})
