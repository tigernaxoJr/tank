/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_PEER_HOST?: string
  readonly VITE_PEER_PORT?: string
  readonly VITE_PEER_PATH?: string
  readonly VITE_PEER_SECURE?: string
  readonly VITE_PEER_KEY?: string
  readonly VITE_PEER_FALLBACK_PUBLIC?: string
  readonly VITE_STUN_URLS?: string
  readonly VITE_TURN_URL?: string
  readonly VITE_TURN_USERNAME?: string
  readonly VITE_TURN_CREDENTIAL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** 建置版本字串（git 短 hash · 建置時間），由 vite.config.ts 注入 */
declare const __BUILD_ID__: string
