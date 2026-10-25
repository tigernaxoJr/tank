/** 新 UI 素材（`public/assets/ui2/<sheet>/<name>.png`，由 tools/assets/agy-ui/slice_ui.py 切出） */
export type UiSheet = 'ui_kit' | 'icons' | 'gauges' | 'title'

export type UiIconName =
  | 'shell' | 'arrow_left' | 'arrow_up' | 'skip' | 'wind' | 'fuel' | 'heart' | 'shield'
  | 'poison' | 'freeze' | 'drench' | 'gear' | 'sound_on' | 'sound_off' | 'copy' | 'check'
  | 'crown' | 'robot' | 'lock' | 'radar' | 'pause' | 'close' | 'chevron_left' | 'plus'
  | 'link' | 'trophy' | 'skull' | 'target' | 'refresh' | 'question' | 'person' | 'clock'

export function uiUrl(sheet: UiSheet, name: string): string {
  // base 是 './'：放進 CSS 變數的相對網址會以樣式表（/assets/*.css）為基準，變成 assets/assets/...，所以轉成絕對網址
  return new URL(`${import.meta.env.BASE_URL}assets/ui2/${sheet}/${name}.png`, document.baseURI).href
}
