//! 與 TS 核心 (`src/shared/wasm/index.ts`) 的一致性測試：讀取 `src/test/parity.test.ts` 產生的黃金檔，
//! 以相同 seed 與地形參數重建地形，逐項比對雜湊、地表取樣、挖坑後雜湊與彈道結果。

use serde::Deserialize;
use tank_core::ballistics::simulate_shot;
use tank_core::terrain::{TerrainGrid, TerrainOptions};

#[derive(Deserialize)]
struct Golden {
    cases: Vec<Case>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    map_id: String,
    seed: u32,
    width: u32,
    height: u32,
    options: serde_json::Value,
    fresh: Sample,
    carves: Vec<Carve>,
    carved: Sample,
    shots: Vec<Shot>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Sample {
    hash: u32,
    surface_y: Vec<i32>,
    ground_below: Vec<i32>,
    slope: Vec<i32>,
    slope_from: Vec<i32>,
    material: Vec<u8>,
}

#[derive(Deserialize)]
struct Carve {
    x: i32,
    y: i32,
    r: i32,
    rect: Rect,
}

#[derive(Deserialize)]
struct Rect {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Shot {
    start_x: i32,
    start_y: i32,
    vx_milli: i32,
    vy_milli: i32,
    wind_milli: i32,
    gravity_milli: i32,
    hit: Hit,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Hit {
    hit_x: i32,
    hit_y: i32,
    impacted_terrain: bool,
    hit_tank: bool,
    steps_taken: u32,
}

fn check_sample(label: &str, grid: &TerrainGrid, s: &Sample) {
    assert_eq!(grid.state_hash(), s.hash, "{label}: 地形雜湊");
    for (i, x) in (0..grid.width() as i32).step_by(97).enumerate() {
        assert_eq!(grid.surface_y(x), s.surface_y[i], "{label}: surfaceY x={x}");
        assert_eq!(grid.ground_below(x, 300), s.ground_below[i], "{label}: groundBelow x={x}");
        assert_eq!(grid.surface_slope_deg(x, 6, None), s.slope[i], "{label}: slope x={x}");
        assert_eq!(grid.surface_slope_deg(x, 6, Some(300)), s.slope_from[i], "{label}: slope(fromY) x={x}");
        let y = (grid.surface_y(x) + 3).min(grid.height() as i32 - 1);
        assert_eq!(grid.material_at(x, y), s.material[i], "{label}: material x={x}");
    }
}

#[test]
fn terrain_and_shots_match_typescript_core() {
    let golden: Golden = serde_json::from_str(include_str!("fixtures/golden.json")).expect("golden.json");
    assert!(!golden.cases.is_empty());
    for c in &golden.cases {
        let label = format!("{} seed={}", c.map_id, c.seed);
        let options: TerrainOptions = serde_json::from_value(c.options.clone()).expect("options");
        // TS 核心預設以 DEFAULT_WORLD 尺寸建構，再由 options 的 width/height 調整；這裡用相同流程
        let mut grid = TerrainGrid::new(2400, 1100, c.seed);
        grid.reset_with(c.seed, &options);
        assert_eq!((grid.width(), grid.height()), (c.width, c.height), "{label}: 尺寸");
        check_sample(&format!("{label} fresh"), &grid, &c.fresh);

        for carve in &c.carves {
            let r = grid.carve_circle(carve.x, carve.y, carve.r);
            assert_eq!((r.x, r.y, r.width, r.height), (carve.rect.x, carve.rect.y, carve.rect.width, carve.rect.height), "{label}: 髒矩形");
        }
        check_sample(&format!("{label} carved"), &grid, &c.carved);

        for s in &c.shots {
            let h = simulate_shot(s.start_x, s.start_y, s.vx_milli, s.vy_milli, s.wind_milli, s.gravity_milli, 1200, &grid);
            assert_eq!(
                (h.hit_x, h.hit_y, h.impacted_terrain, h.hit_tank, h.steps_taken),
                (s.hit.hit_x, s.hit.hit_y, s.hit.impacted_terrain, s.hit.hit_tank, s.hit.steps_taken),
                "{label}: 彈道"
            );
        }
    }
}
