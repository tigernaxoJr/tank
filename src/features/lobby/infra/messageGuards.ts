import type { PlayerId, ProtocolMessage } from '@/shared/kernel/types'

/**
 * 房主收到客端的動作訊息時，確認 `playerId` 就是送件的連線槽位；
 * 不符（替別人的坦克開火 / 移動）一律視為偽造，不轉發也不處理。其他類型的訊息不受此規則限制。
 */
export function isForgedAction(msg: ProtocolMessage, senderSlotId: PlayerId): boolean {
  return (msg.type === 'ACTION_FIRE' || msg.type === 'ACTION_MOVE') && msg.playerId !== senderSlotId
}
