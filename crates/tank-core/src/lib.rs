//! # tank-core
//!
//! 確定性物理與可破壞地形核心引擎。
//! 採用 **VSA (Vertical Slice Architecture)** 隔離功能模組，
//! 模組內部依複雜度採 **務實 DDD (Pragmatic DDD)**：
//! - 單純計算 slice（如 `prng`）單檔直寫，禁止過度拆分。
//! - 含狀態與跨邊界轉換的 slice（如 `terrain`, `ballistics`, `combat`）保留輕量領域結構。

pub mod ballistics;
pub mod combat;
pub mod prng;
pub mod terrain;
