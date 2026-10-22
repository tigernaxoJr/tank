//! 地形模組 (Terrain Slice)
//! 負責波形地表生成、版型特徵（浮空島 / 橋 / 橢圓 / 矩形）、材質遮罩（空氣 / 土壤 / 基岩）與圓形彈坑破壞 (carve_circle)。
//! 生成流程、RNG 消耗順序與取整方式須與 `src/shared/wasm/index.ts` 的 `DeterministicTankCore.resetTerrain` 逐步一致
//! （由 `tests/parity.rs` 對照 TS 產生的黃金檔驗證）。

use crate::prng::DeterministicRng;
use serde::Deserialize;
use wasm_bindgen::prelude::*;

/// 遮罩值：0 = 空氣、1 = 可破壞土壤、2 = 不可破壞基岩
pub const AIR: u8 = 0;
pub const DIRT: u8 = 1;
pub const BEDROCK: u8 = 2;

/// 彈坑更新髒矩形 (Value Object)
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DirtyRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TerrainOp {
    #[default]
    Add,
    Carve,
    Bedrock,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum BridgeShape {
    #[default]
    Flat,
    Arch,
    Sag,
    W,
    Wave,
}

/// 地形版型特徵；座標皆為地圖寬 / 高的比例 (0~1)，與 TS 的 `TerrainFeature` 同構
#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum TerrainFeature {
    Island {
        cx: f64,
        y: f64,
        w: f64,
        depth: f64,
        #[serde(default)]
        op: TerrainOp,
    },
    Bridge {
        x0: f64,
        x1: f64,
        y: f64,
        thickness: f64,
        #[serde(default)]
        shape: BridgeShape,
        bend: Option<f64>,
        waves: Option<f64>,
        end_thickness: Option<f64>,
        #[serde(default)]
        op: TerrainOp,
    },
    Ellipse {
        cx: f64,
        cy: f64,
        rx: f64,
        ry: f64,
        op: TerrainOp,
    },
    Rect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        op: TerrainOp,
    },
}

/// 地形生成參數，欄位與 TS 的 `TerrainWaveOptions` 同名（JSON camelCase）
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TerrainOptions {
    /// "waves"（預設）或 "none"（沒有地面，只靠 features）
    pub base_mode: Option<String>,
    pub base_thickness: Option<i32>,
    #[serde(default)]
    pub features: Vec<TerrainFeature>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub base_height_ratio: Option<f64>,
    pub amp1: Option<[i32; 2]>,
    pub amp2: Option<[i32; 2]>,
    pub amp3: Option<[i32; 2]>,
    pub wavelength1: Option<f64>,
    pub wavelength2: Option<f64>,
    pub wavelength3: Option<f64>,
    pub jitter: Option<i32>,
}

/// 對齊 JS `Math.round`（四捨五入、.5 往正無限大）
fn js_round(v: f64) -> i32 {
    (v + 0.5).floor() as i32
}

/// 確定性的低頻正弦雜訊（不消耗 RNG）
fn edge_noise(x: i32, k: f64, amp: f64) -> i32 {
    js_round((x as f64 * 0.045 + k).sin() * amp + (x as f64 * 0.13 + k * 2.3).sin() * amp * 0.45)
}

/// 地形領域聚合根 (Aggregate Root)
#[wasm_bindgen]
pub struct TerrainGrid {
    width: u32,
    height: u32,
    /// 0 = 空氣、1 = 土壤、2 = 基岩 (ponytail: 1 byte per pixel for simplicity, bitpack only if memory profiling demands)
    mask: Vec<u8>,
}

impl TerrainGrid {
    /// 依參數重新生成地形（與 TS `resetTerrain(seed, options)` 等價）
    pub fn reset_with(&mut self, seed: u32, options: &TerrainOptions) {
        if let (Some(w), Some(h)) = (options.width, options.height) {
            if w > 0 && h > 0 && (self.width != w || self.height != h) {
                self.width = w;
                self.height = h;
                self.mask = vec![0u8; (w * h) as usize];
            }
        }
        let width = self.width as i32;
        let height = self.height as i32;
        let mut rng = DeterministicRng::new(seed);
        self.mask.fill(0);

        let phase1 = rng.next_range(0, 628) as f64 / 100.0;
        let phase2 = rng.next_range(0, 628) as f64 / 100.0;
        let phase3 = rng.next_range(0, 628) as f64 / 100.0;

        let [a1_min, a1_max] = options.amp1.unwrap_or([90, 145]);
        let [a2_min, a2_max] = options.amp2.unwrap_or([40, 75]);
        let [a3_min, a3_max] = options.amp3.unwrap_or([15, 30]);
        let amp1 = rng.next_range(a1_min, a1_max) as f64;
        let amp2 = rng.next_range(a2_min, a2_max) as f64;
        let amp3 = rng.next_range(a3_min, a3_max) as f64;

        let wl1 = options.wavelength1.unwrap_or(260.0);
        let wl2 = options.wavelength2.unwrap_or(115.0);
        let wl3 = options.wavelength3.unwrap_or(48.0);

        let base_line = (height as f64 * options.base_height_ratio.unwrap_or(0.62)).floor() as i32;
        let min_h = (height as f64 * 0.25).floor() as i32;
        let max_h = (height as f64 * 0.86).floor() as i32;
        let base_none = options.base_mode.as_deref() == Some("none");
        let thickness = options.base_thickness.unwrap_or(0);
        let jitter_max = options.jitter.unwrap_or(18);
        let mut jitter = 0i32;

        for x in 0..width {
            jitter = (jitter + rng.next_range(-1, 1)).clamp(-jitter_max, jitter_max);
            if base_none {
                continue;
            }
            let xf = x as f64;
            let wave = (xf / wl1 + phase1).sin() * amp1
                + (xf / wl2 + phase2).cos() * amp2
                + (xf / wl3 + phase3).sin() * amp3
                + jitter as f64;
            let surface = js_round(base_line as f64 + wave).clamp(min_h, max_h);
            let bottom = if thickness > 0 {
                // JS Math.round(jitter / 3)
                height.min(surface + thickness + js_round(jitter as f64 / 3.0))
            } else {
                height
            };
            for y in surface..bottom {
                self.mask[(y * width + x) as usize] = DIRT;
            }
        }

        for f in &options.features {
            self.apply_feature(f);
        }
    }

    fn paint_column(&mut self, x: i32, y0: f64, y1: f64, op: TerrainOp) {
        if x < 0 || x >= self.width as i32 {
            return;
        }
        let top = js_round(y0).max(0);
        let bottom = js_round(y1).min(self.height as i32);
        for y in top..bottom {
            let i = (y as u32 * self.width + x as u32) as usize;
            match op {
                TerrainOp::Carve => {
                    if self.mask[i] != BEDROCK {
                        self.mask[i] = AIR;
                    }
                }
                TerrainOp::Bedrock => self.mask[i] = BEDROCK,
                TerrainOp::Add => {
                    if self.mask[i] == AIR {
                        self.mask[i] = DIRT;
                    }
                }
            }
        }
    }

    fn apply_feature(&mut self, f: &TerrainFeature) {
        let w_px = self.width as f64;
        let h_px = self.height as f64;
        match f {
            TerrainFeature::Island { cx, y, w, depth, op } => {
                let half = w * w_px / 2.0;
                let cx = cx * w_px;
                let top = y * h_px;
                let depth = depth * h_px;
                let k = cx * 0.01;
                let mut x = (cx - half).floor() as i32;
                while x <= (cx + half).ceil() as i32 {
                    let t = (x as f64 - cx) / half;
                    if (-1.0..=1.0).contains(&t) {
                        let shoulder = (1.0 - t * t).sqrt();
                        let y0 = top
                            + (1.0 - (1.0 - t.powf(8.0)).max(0.0).sqrt()) * 18.0
                            + edge_noise(x, k, 3.0) as f64;
                        let y1 = top
                            + 14.0
                            + depth * shoulder.powf(0.8)
                            + edge_noise(x, k + 1.7, 7.0) as f64 * shoulder;
                        self.paint_column(x, y0, y1.max(y0 + 8.0), *op);
                    }
                    x += 1;
                }
            }
            TerrainFeature::Bridge { x0, x1, y, thickness, shape, bend, waves, end_thickness, op } => {
                let x0 = js_round(x0 * w_px);
                let x1 = js_round(x1 * w_px);
                let span = (x1 - x0).max(1) as f64;
                let bend = bend.unwrap_or(0.0) * h_px;
                let waves = waves.unwrap_or(2.0);
                let thick = thickness * h_px;
                let end_thick = end_thickness.unwrap_or(*thickness) * h_px;
                let k = x0 as f64 * 0.013;
                for x in x0..=x1 {
                    let t = (x - x0) as f64 / span;
                    let offset = match shape {
                        BridgeShape::Flat => 0.0,
                        BridgeShape::Arch => -(std::f64::consts::PI * t).sin() * bend,
                        BridgeShape::Sag => (std::f64::consts::PI * t).sin() * bend,
                        BridgeShape::W => ((1.0 - (4.0 * std::f64::consts::PI * t).cos()) / 2.0) * bend,
                        BridgeShape::Wave => (waves * 2.0 * std::f64::consts::PI * t).sin() * bend,
                    };
                    let edge = (1.0 - t.min(1.0 - t) / 0.15).max(0.0);
                    let th = thick + (end_thick - thick) * edge * edge;
                    let y0 = y * h_px + offset + edge_noise(x, k, 2.0) as f64;
                    self.paint_column(x, y0, y0 + th + edge_noise(x, k + 3.1, 4.0) as f64, *op);
                }
            }
            TerrainFeature::Ellipse { cx, cy, rx, ry, op } => {
                let cx = cx * w_px;
                let cy = cy * h_px;
                let rx = rx * w_px;
                let ry = ry * h_px;
                let mut x = (cx - rx).floor() as i32;
                while x <= (cx + rx).ceil() as i32 {
                    let t = (x as f64 - cx) / rx;
                    if (-1.0..=1.0).contains(&t) {
                        let h = ry * (1.0 - t * t).sqrt();
                        self.paint_column(x, cy - h, cy + h, *op);
                    }
                    x += 1;
                }
            }
            TerrainFeature::Rect { x, y, w, h, op } => {
                let x0 = js_round(x * w_px);
                let x1 = js_round((x + w) * w_px);
                for xi in x0..x1 {
                    self.paint_column(xi, y * h_px, (y + h) * h_px, *op);
                }
            }
        }
    }
}

#[wasm_bindgen]
impl TerrainGrid {
    /// 以預設波形參數生成地形
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32, seed: u32) -> Self {
        let mut grid = Self {
            width,
            height,
            mask: vec![0u8; (width * height) as usize],
        };
        grid.reset_with(seed, &TerrainOptions::default());
        grid
    }

    /// 以 JSON（同 TS `TerrainWaveOptions`）重新生成地形，供 Wasm 端呼叫
    pub fn reset_terrain(&mut self, seed: u32, options_json: &str) -> Result<(), JsValue> {
        let options: TerrainOptions = if options_json.trim().is_empty() {
            TerrainOptions::default()
        } else {
            serde_json::from_str(options_json).map_err(|e| JsValue::from_str(&e.to_string()))?
        };
        self.reset_with(seed, &options);
        Ok(())
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn is_solid(&self, x: i32, y: i32) -> bool {
        self.material_at(x, y) != AIR
    }

    /// 0 = 空氣、1 = 土壤、2 = 不可破壞基岩；界外視為空氣
    pub fn material_at(&self, x: i32, y: i32) -> u8 {
        if x < 0 || y < 0 || x >= self.width as i32 || y >= self.height as i32 {
            return AIR;
        }
        self.mask[(y as u32 * self.width + x as u32) as usize]
    }

    /// 挖出圓形彈坑（基岩不可破壞）並回傳受影響的局部髒矩形 (DirtyRect)
    pub fn carve_circle(&mut self, cx: i32, cy: i32, radius: i32) -> DirtyRect {
        let min_x = (cx - radius).max(0) as u32;
        let max_x = (cx + radius).min(self.width as i32 - 1).max(0) as u32;
        let min_y = (cy - radius).max(0) as u32;
        let max_y = (cy + radius).min(self.height as i32 - 1).max(0) as u32;
        let r_sq = radius * radius;

        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let dx = x as i32 - cx;
                let dy = y as i32 - cy;
                let i = (y * self.width + x) as usize;
                if dx * dx + dy * dy <= r_sq && self.mask[i] != BEDROCK {
                    self.mask[i] = AIR;
                }
            }
        }

        DirtyRect {
            x: min_x,
            y: min_y,
            width: max_x.saturating_sub(min_x) + 1,
            height: max_y.saturating_sub(min_y) + 1,
        }
    }

    /// 堆出圓形土丘（只把空氣填成土壤，基岩不變）並回傳髒矩形；築壘彈等「新增地形」用
    pub fn fill_circle(&mut self, cx: i32, cy: i32, radius: i32) -> DirtyRect {
        let min_x = (cx - radius).max(0) as u32;
        let max_x = (cx + radius).min(self.width as i32 - 1).max(0) as u32;
        let min_y = (cy - radius).max(0) as u32;
        let max_y = (cy + radius).min(self.height as i32 - 1).max(0) as u32;
        let r_sq = radius * radius;

        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let dx = x as i32 - cx;
                let dy = y as i32 - cy;
                let i = (y * self.width + x) as usize;
                if dx * dx + dy * dy <= r_sq && self.mask[i] == AIR {
                    self.mask[i] = DIRT;
                }
            }
        }

        DirtyRect {
            x: min_x,
            y: min_y,
            width: max_x.saturating_sub(min_x) + 1,
            height: max_y.saturating_sub(min_y) + 1,
        }
    }

    /// 供狀態同步比對的輕量確定性雜湊 (FNV-1a 32-bit)
    pub fn state_hash(&self) -> u32 {
        let mut hash: u32 = 0x811c9dc5;
        for &byte in &self.mask {
            hash ^= byte as u32;
            hash = hash.wrapping_mul(0x01000193);
        }
        hash
    }

    /// 整欄最上方的地表 Y（首個實心像素），若無實心像素則回傳 height
    pub fn surface_y(&self, x: i32) -> i32 {
        self.ground_below(x, 0)
    }

    /// 從 `from_y` 往下找第一個實心像素（多層地形用）；找不到回傳 height（深淵）
    pub fn ground_below(&self, x: i32, from_y: i32) -> i32 {
        let cx = x.clamp(0, (self.width as i32 - 1).max(0));
        for y in from_y.max(0)..self.height as i32 {
            if self.mask[(y as u32 * self.width + cx as u32) as usize] != AIR {
                return y;
            }
        }
        self.height as i32
    }

    /// 以整數運算求出局部地表坡度（度，限制 -45~45）；`from_y` 有值時改用 ground_below 取樣
    pub fn surface_slope_deg(&self, x: i32, sample_span: i32, from_y: Option<i32>) -> i32 {
        let span = sample_span.max(1);
        let (y_left, y_right) = match from_y {
            Some(f) => (self.ground_below(x - span, f), self.ground_below(x + span, f)),
            None => (self.surface_y(x - span), self.surface_y(x + span)),
        };
        let dy = y_right - y_left;
        let dx = 2 * span;
        ((dy * 45) / dx).clamp(-45, 45)
    }

    /// 回傳像素遮罩指標供 Wasm 零拷貝記憶體存取
    pub fn mask_ptr(&self) -> *const u8 {
        self.mask.as_ptr()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn carve_circle_clears_pixels_and_changes_hash() {
        let mut grid = TerrainGrid::new(100, 100, 12345);
        let initial_hash = grid.state_hash();
        let rect = grid.carve_circle(50, 80, 10);
        assert!(rect.width > 0 && rect.height > 0);
        assert!(!grid.is_solid(50, 80));
        assert_ne!(initial_hash, grid.state_hash());
    }

    #[test]
    fn fill_circle_adds_dirt_in_air() {
        let mut grid = TerrainGrid::new(100, 100, 12345);
        let sy = grid.surface_y(50);
        assert!(!grid.is_solid(50, sy - 5));
        grid.fill_circle(50, sy, 10);
        assert!(grid.is_solid(50, sy - 5));
        assert_eq!(grid.material_at(50, sy - 5), DIRT);
    }

    #[test]
    fn surface_y_and_clamping() {
        let mut grid = TerrainGrid::new(100, 100, 12345);
        let sy = grid.surface_y(50);
        assert!(sy >= 0 && sy < 100);
        assert!(!grid.is_solid(50, sy - 1));
        assert!(grid.is_solid(50, sy));

        // Clamping checks
        assert_eq!(grid.surface_y(-10), grid.surface_y(0));
        assert_eq!(grid.surface_y(200), grid.surface_y(99));

        // When column is entirely hollowed out
        grid.carve_circle(50, 50, 100);
        assert_eq!(grid.surface_y(50), 100);
    }

    #[test]
    fn surface_slope_deg_computation() {
        let grid = TerrainGrid::new(100, 100, 12345);
        let slope = grid.surface_slope_deg(50, 5, None);
        assert!(slope >= -45 && slope <= 45);

        // Negative or zero sample span defaults to at least 1
        let slope_min_span = grid.surface_slope_deg(50, 0, None);
        assert!(slope_min_span >= -45 && slope_min_span <= 45);
    }

    #[test]
    fn mask_ptr_validity() {
        let grid = TerrainGrid::new(100, 100, 12345);
        let ptr = grid.mask_ptr();
        assert!(!ptr.is_null());
        assert_eq!(unsafe { *ptr }, grid.mask[0]);
    }
}
