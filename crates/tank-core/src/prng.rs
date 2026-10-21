//! 確定性偽隨機數產生器 (Deterministic PRNG - XorShift32)。
//! 小模組遵循「務實 DDD」原則：不拆多檔，單檔涵蓋值物件與純函數邏輯。

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DeterministicRng {
    state: u32,
}

#[wasm_bindgen]
impl DeterministicRng {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32) -> Self {
        Self {
            state: if seed == 0 { 0xBAD5EED } else { seed },
        }
    }

    pub fn next_u32(&mut self) -> u32 {
        let mut x = self.state;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.state = x;
        x
    }

    /// 產生 [min, max] 閉區間內的確定性整數
    pub fn next_range(&mut self, min: i32, max: i32) -> i32 {
        if min >= max {
            return min;
        }
        let span = (max - min + 1) as u32;
        min + (self.next_u32() % span) as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_sequence_matches_across_runs() {
        let mut a = DeterministicRng::new(42);
        let mut b = DeterministicRng::new(42);
        for _ in 0..10 {
            assert_eq!(a.next_u32(), b.next_u32());
        }
    }
}
