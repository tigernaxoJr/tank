//! 彈道物理模組 (Ballistics Slice)
//! 採用整數微單位 (1/1000 pixel) 進行確定性拋物線步進，徹底消除跨平台浮點數誤差。

use crate::terrain::TerrainGrid;
use wasm_bindgen::prelude::*;

/// 彈道步進結果 (Value Object)
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TrajectoryHit {
    pub hit_x: i32,
    pub hit_y: i32,
    pub impacted_terrain: bool,
    pub hit_tank: bool,
    pub steps_taken: u32,
}

/// 模擬單發砲彈軌跡並可選判定目標坦克碰撞
#[wasm_bindgen]
pub fn simulate_shot_with_target(
    start_x: i32,
    start_y: i32,
    vx_milli: i32,
    vy_milli: i32,
    wind_milli: i32,
    gravity_milli: i32,
    max_steps: u32,
    terrain: &TerrainGrid,
    target_x: i32,
    target_y: i32,
    target_radius: i32,
) -> TrajectoryHit {
    let mut x_milli = start_x * 1000;
    let mut y_milli = start_y * 1000;
    let mut vx = vx_milli;
    let mut vy = vy_milli;

    for step in 1..=max_steps {
        x_milli += vx;
        y_milli += vy;
        vx += wind_milli;
        vy += gravity_milli;

        let px = x_milli / 1000;
        let py = y_milli / 1000;

        if target_radius > 0 {
            let dx = (px - target_x) as i64;
            let dy = (py - target_y) as i64;
            let r = target_radius as i64;
            if dx * dx + dy * dy <= r * r {
                return TrajectoryHit {
                    hit_x: px,
                    hit_y: py,
                    impacted_terrain: false,
                    hit_tank: true,
                    steps_taken: step,
                };
            }
        }

        if px < 0 || px >= terrain.width() as i32 || py >= terrain.height() as i32 {
            return TrajectoryHit {
                hit_x: px,
                hit_y: py,
                impacted_terrain: false,
                hit_tank: false,
                steps_taken: step,
            };
        }

        if terrain.is_solid(px, py) {
            return TrajectoryHit {
                hit_x: px,
                hit_y: py,
                impacted_terrain: true,
                hit_tank: false,
                steps_taken: step,
            };
        }
    }

    TrajectoryHit {
        hit_x: x_milli / 1000,
        hit_y: y_milli / 1000,
        impacted_terrain: false,
        hit_tank: false,
        steps_taken: max_steps,
    }
}

/// 以千分位定點數模擬單發砲彈軌跡直到命中地形或出界
#[wasm_bindgen]
pub fn simulate_shot(
    start_x: i32,
    start_y: i32,
    vx_milli: i32,
    vy_milli: i32,
    wind_milli: i32,
    gravity_milli: i32,
    max_steps: u32,
    terrain: &TerrainGrid,
) -> TrajectoryHit {
    simulate_shot_with_target(
        start_x,
        start_y,
        vx_milli,
        vy_milli,
        wind_milli,
        gravity_milli,
        max_steps,
        terrain,
        -9999,
        -9999,
        0,
    )
}

/// 產生彈道預覽軌跡點 (採樣 `sample_count` 個點，間隔 `step_stride` 步)
#[wasm_bindgen]
pub fn preview_trajectory(
    start_x: i32,
    start_y: i32,
    vx_milli: i32,
    vy_milli: i32,
    wind_milli: i32,
    gravity_milli: i32,
    sample_count: u32,
    step_stride: u32,
) -> Vec<i32> {
    if sample_count == 0 || step_stride == 0 {
        return Vec::new();
    }

    let mut points = Vec::with_capacity((sample_count as usize) * 2);
    let mut x_milli = start_x * 1000;
    let mut y_milli = start_y * 1000;
    let mut vx = vx_milli;
    let mut vy = vy_milli;

    let total_steps = sample_count.saturating_mul(step_stride);
    for step in 1..=total_steps {
        x_milli += vx;
        y_milli += vy;
        vx += wind_milli;
        vy += gravity_milli;

        if step % step_stride == 0 {
            points.push(x_milli / 1000);
            points.push(y_milli / 1000);
        }
    }

    points
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_shot_impacts_terrain() {
        let grid = TerrainGrid::new(200, 120, 777);
        let hit = simulate_shot(20, 10, 2000, 0, 0, 150, 500, &grid);
        assert!(hit.steps_taken < 500);
        assert!(hit.impacted_terrain);
        assert!(!hit.hit_tank);
    }

    #[test]
    fn simulate_shot_with_target_hits_tank() {
        let grid = TerrainGrid::new(200, 120, 777);
        let hit = simulate_shot_with_target(20, 10, 1000, 0, 0, 0, 100, &grid, 30, 10, 2);
        assert!(hit.hit_tank);
        assert!(!hit.impacted_terrain);
        assert_eq!(hit.steps_taken, 8);
        assert_eq!(hit.hit_x, 28);
        assert_eq!(hit.hit_y, 10);
    }

    #[test]
    fn preview_trajectory_generates_expected_points() {
        let points = preview_trajectory(10, 20, 1000, 2000, 0, 0, 3, 5);
        assert_eq!(points.len(), 6);
        assert_eq!(points, vec![15, 30, 20, 40, 25, 50]);
    }
}
