//! 地形模組 (Terrain Slice)
//! 負責高度圖生成、像素遮罩與圓形彈坑破壞 (carve_circle)。

use crate::prng::DeterministicRng;
use wasm_bindgen::prelude::*;

/// 彈坑更新髒矩形 (Value Object)
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DirtyRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// 地形領域聚合根 (Aggregate Root)
#[wasm_bindgen]
pub struct TerrainGrid {
    width: u32,
    height: u32,
    /// 1 代表實心土壤，0 代表空氣 (ponytail: 1 byte per pixel for simplicity, bitpack only if memory profiling demands)
    mask: Vec<u8>,
}

#[wasm_bindgen]
impl TerrainGrid {
    #[wasm_bindgen(constructor)]
    pub fn new(width: u32, height: u32, seed: u32) -> Self {
        let mut rng = DeterministicRng::new(seed);
        let mut mask = vec![0u8; (width * height) as usize];
        let mut current_h = (height as i32) / 2;

        for x in 0..width {
            let delta = rng.next_range(-2, 2);
            current_h = (current_h + delta).clamp((height as i32) / 4, (height as i32) * 3 / 4);
            for y in (current_h as u32)..height {
                mask[(y * width + x) as usize] = 1;
            }
        }

        Self {
            width,
            height,
            mask,
        }
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    pub fn is_solid(&self, x: i32, y: i32) -> bool {
        if x < 0 || y < 0 || x >= self.width as i32 || y >= self.height as i32 {
            return false;
        }
        self.mask[(y as u32 * self.width + x as u32) as usize] != 0
    }

    /// 挖出圓形彈坑並回傳受影響的局部髒矩形 (DirtyRect)
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
                if dx * dx + dy * dy <= r_sq {
                    self.mask[(y * self.width + x) as usize] = 0;
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

    /// 取得指定 X 座標的表面高度 Y（首個實心像素），若無實心像素則回傳 height
    pub fn surface_y(&self, x: i32) -> i32 {
        let max_x = (self.width as i32 - 1).max(0);
        let clamped_x = x.clamp(0, max_x);
        for y in 0..self.height as i32 {
            if self.is_solid(clamped_x, y) {
                return y;
            }
        }
        self.height as i32
    }

    /// 以整數運算求出局部地表坡度（角度度數，限制在 -45 到 45 度）
    pub fn surface_slope_deg(&self, x: i32, sample_span: i32) -> i32 {
        let span = sample_span.max(1);
        let y_left = self.surface_y(x - span);
        let y_right = self.surface_y(x + span);
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
        let slope = grid.surface_slope_deg(50, 5);
        assert!(slope >= -45 && slope <= 45);

        // Negative or zero sample span defaults to at least 1
        let slope_min_span = grid.surface_slope_deg(50, 0);
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
