import type { FaceAtlas } from '../tankBlueprint'

/** tools/sprites2d/pack_face_atlas.py 產生（來源：2D 生圖表情 sheet）；影格 = [x, y, w, h] */
export const SEAHORSE_FACE: FaceAtlas = {
  key: 'seahorse_face',
  url: './assets/units/tanks/seahorse_face.png',
  size: [512, 115],
  /** 圖集像素 → 遊戲像素（眼球直徑 56px × 0.2 ≈ 眼柄頂球 11px） */
  scale: 0.14,
  frames: {
    eye_closed: [264, 0, 64, 62],
    eye_dead: [0, 0, 64, 65],
    eye_half: [330, 0, 64, 62],
    eye_happy: [98, 67, 64, 39],
    eye_hurt: [66, 0, 64, 63],
    eye_open: [132, 0, 64, 63],
    eye_sleepy: [396, 0, 64, 62],
    far_wide: [198, 0, 64, 63],
    fx_star: [0, 67, 50, 48],
    fx_sweat: [462, 0, 33, 50],
    pupil_dizzy: [164, 67, 42, 37],
    pupil_normal: [52, 67, 44, 44],
  },
}
