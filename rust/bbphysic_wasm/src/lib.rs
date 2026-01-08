#![allow(clippy::not_unsafe_ptr_arg_deref)]

// Minimal wasm export surface for solver acceleration.
//
// This deliberately avoids wasm-bindgen to keep the integration simple:
// JS side can instantiate the wasm and call exports, passing pointers into
// wasm linear memory.
//
// Exported functions:
// - bbp_alloc(len_bytes) -> *mut u8
// - bbp_free(ptr, len_bytes)
// - bbp_solve_step(bone_count, dt, k, c, value_ptr, vel_ptr, targets_ptr,
//                  chain_count, chain_starts_ptr, chain_lengths_ptr,
//                  rest_delta_ptr, coupling, iterations, tip_falloff)
//   All arrays are f32 (except chain arrays are u32).

use core::mem;

#[no_mangle]
pub extern "C" fn bbp_alloc(len_bytes: usize) -> *mut u8 {
    let mut buf = Vec::<u8>::with_capacity(len_bytes);
    let ptr = buf.as_mut_ptr();
    mem::forget(buf);
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn bbp_free(ptr: *mut u8, len_bytes: usize) {
    if ptr.is_null() || len_bytes == 0 {
        return;
    }
    let _ = Vec::<u8>::from_raw_parts(ptr, 0, len_bytes);
}

#[inline]
unsafe fn slice_f32<'a>(ptr: *mut f32, len: usize) -> &'a mut [f32] {
    core::slice::from_raw_parts_mut(ptr, len)
}

#[inline]
unsafe fn slice_u32<'a>(ptr: *const u32, len: usize) -> &'a [u32] {
    core::slice::from_raw_parts(ptr, len)
}

#[no_mangle]
pub unsafe extern "C" fn bbp_solve_step(
    bone_count: u32,
    dt: f32,
    follow_strength: f32,
    follow_damping: f32,
    value_ptr: *mut f32,
    vel_ptr: *mut f32,
    targets_ptr: *const f32,
    chain_count: u32,
    chain_starts_ptr: *const u32,
    chain_lengths_ptr: *const u32,
    rest_delta_ptr: *const f32,
    coupling: f32,
    iterations: u32,
    tip_falloff: f32,
) {
    let n = bone_count as usize;
    if n == 0 {
        return;
    }
    let value = slice_f32(value_ptr, n);
    let vel = slice_f32(vel_ptr, n);
    let targets = core::slice::from_raw_parts(targets_ptr, n);
    let rest_delta = core::slice::from_raw_parts(rest_delta_ptr, n);

    // 1) second-order follow
    let k = follow_strength.max(0.0);
    let c = follow_damping.max(0.0);
    for i in 0..n {
        let x = value[i];
        let v = vel[i];
        let x_t = targets[i];
        let accel = (x_t - x) * k - v * c;
        let v2 = v + accel * dt;
        let x2 = x + v2 * dt;
        vel[i] = v2;
        value[i] = x2;
    }

    // 2) chain coupling
    let iters = (iterations.min(64)) as usize;
    let chain_cnt = chain_count as usize;
    if iters == 0 || chain_cnt == 0 {
        return;
    }
    let chain_starts = slice_u32(chain_starts_ptr, chain_cnt);
    let chain_lengths = slice_u32(chain_lengths_ptr, chain_cnt);

    let base_coupling = coupling.clamp(0.0, 1.0);
    let tip_falloff = tip_falloff.clamp(0.0, 1.0);

    for _ in 0..iters {
        for c_idx in 0..chain_cnt {
            let start = chain_starts[c_idx] as usize;
            let len = chain_lengths[c_idx] as usize;
            if len <= 1 {
                continue;
            }
            for local in 1..len {
                let i = start + local;
                let parent = i - 1;
                if i >= n || parent >= n {
                    break;
                }
                let t = (local as f32) / ((len - 1) as f32);
                let coupling_scaled = base_coupling * (1.0 - tip_falloff * t);
                let desired = value[parent] + rest_delta[i];
                value[i] = value[i] + (desired - value[i]) * coupling_scaled;
            }
        }
    }
}
