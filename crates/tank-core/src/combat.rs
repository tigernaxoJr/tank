//! 戰鬥與傷害判定模組 (Combat Slice)
//! 負責爆炸距離衰減傷害與坦克狀態結算。

use wasm_bindgen::prelude::*;

/// 計算爆炸中心對目標座標的確定性整數傷害（線性距離衰減）
#[wasm_bindgen]
pub fn compute_explosion_damage(
    explosion_x: i32,
    explosion_y: i32,
    tank_x: i32,
    tank_y: i32,
    blast_radius: i32,
    max_damage: i32,
) -> i32 {
    if blast_radius <= 0 || max_damage <= 0 {
        return 0;
    }
    let dx = tank_x - explosion_x;
    let dy = tank_y - explosion_y;
    let dist_sq = dx * dx + dy * dy;
    let r_sq = blast_radius * blast_radius;

    if dist_sq >= r_sq {
        return 0;
    }

    // 整數平方根近似，避免浮點數誤差
    let dist = isqrt(dist_sq as u32) as i32;
    ((blast_radius - dist) * max_damage) / blast_radius
}

fn isqrt(n: u32) -> u32 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direct_hit_and_out_of_range_damage() {
        assert_eq!(compute_explosion_damage(50, 50, 50, 50, 30, 40), 40);
        assert_eq!(compute_explosion_damage(50, 50, 100, 100, 30, 40), 0);
    }
}
