/**
 * sycl_parallel.cpp - SYCL/DPC++ parallel implementations of NIST SP 800-22 tests
 *
 * Implements:
 *   1. Runs Test using segmented parallel reduction for transition counting
 *   2. Longest Run of Ones using block-parallel reduction with local memory
 *
 * Compilation with Intel oneAPI DPC++:
 *   icpx -fsycl -O2 -std=c++17 -o nist_sycl ...
 *
 * The SYCL implementations use USM (Unified Shared Memory) for data transfer
 * and nd_range kernels for explicit work-group control.
 */

#include "nist_tests.h"

#include <sycl/sycl.hpp>
#include <chrono>
#include <iostream>
#include <algorithm>
#include <numeric>

// ============================================================
// SYCL device selection helper
// ============================================================

static sycl::device select_device(const std::string& device_str) {
    if (device_str == "gpu") {
        try {
            return sycl::device(sycl::gpu_selector_v);
        } catch (...) {
            std::cerr << "[WARNING] GPU not available, falling back to CPU.\n";
            return sycl::device(sycl::cpu_selector_v);
        }
    } else if (device_str == "cpu") {
        return sycl::device(sycl::cpu_selector_v);
    } else {
        // "auto" - try GPU first, fall back to CPU
        try {
            return sycl::device(sycl::gpu_selector_v);
        } catch (...) {
            return sycl::device(sycl::cpu_selector_v);
        }
    }
}

static std::string device_label(const sycl::device& dev) {
    std::string name = dev.get_info<sycl::info::device::name>();
    if (dev.is_gpu()) return "SYCL-GPU (" + name + ")";
    if (dev.is_cpu()) return "SYCL-CPU (" + name + ")";
    return "SYCL-Device (" + name + ")";
}

// ============================================================
// SYCL Parallel Runs Test
// ============================================================
//
// Parallelization strategy:
//   The sequence of n bits is divided among W work-items. Each work-item
//   processes a contiguous sub-range of bits and computes:
//     (a) The number of transitions (bit[i] != bit[i+1]) within its range
//     (b) The first and last bit of its segment (for boundary merging)
//
//   After the kernel, the host performs a final O(W) pass to merge boundary
//   transitions between adjacent segments. The total runs = transitions + 1.
//
//   This achieves O(n/W) work per item with O(W) merge overhead.
//
// Data layout:
//   - partial_counts[w]: number of internal transitions in segment w
//   - boundary_first[w]: first bit of segment w
//   - boundary_last[w]:  last bit of segment w
//   - partial_ones[w]:   count of ones in segment w (for π computation)
//

TestResult runs_test_sycl(const uint8_t* data, size_t n,
                          size_t wg_size,
                          const std::string& device_str) {
    TestResult result;
    result.test_name = "Runs Test";
    result.n = n;
    result.prerequisite_failed = false;

    // Select device and create queue with profiling
    sycl::device dev = select_device(device_str);
    result.device_name = device_label(dev);
    sycl::queue q(dev, sycl::property::queue::enable_profiling{});

    // Determine work decomposition
    // Total work-items = ceil(n / chunk_size_per_item)
    // We use one work-item per chunk of bits
    size_t chunk_size = 1024;  // Each work-item processes 1024 bits
    size_t num_items = (n + chunk_size - 1) / chunk_size;
    // Round up to multiple of wg_size
    size_t global_size = ((num_items + wg_size - 1) / wg_size) * wg_size;

    auto t_start = std::chrono::high_resolution_clock::now();

    // Allocate USM device memory
    uint8_t* d_data = sycl::malloc_device<uint8_t>(n, q);
    uint32_t* d_partial_trans = sycl::malloc_device<uint32_t>(global_size, q);
    uint8_t* d_boundary_first = sycl::malloc_device<uint8_t>(global_size, q);
    uint8_t* d_boundary_last = sycl::malloc_device<uint8_t>(global_size, q);
    uint32_t* d_partial_ones = sycl::malloc_device<uint32_t>(global_size, q);

    // Copy input data to device
    q.memcpy(d_data, data, n * sizeof(uint8_t)).wait();

    // Launch kernel: each work-item processes one chunk
    auto kernel_event = q.submit([&](sycl::handler& cgh) {
        cgh.parallel_for<class RunsCountKernel>(
            sycl::nd_range<1>(sycl::range<1>(global_size), sycl::range<1>(wg_size)),
            [=](sycl::nd_item<1> item) {
                size_t gid = item.get_global_id(0);
                size_t start = gid * chunk_size;

                if (start >= n) {
                    // Out-of-range work-items write zeros
                    d_partial_trans[gid] = 0;
                    d_boundary_first[gid] = 0;
                    d_boundary_last[gid] = 0;
                    d_partial_ones[gid] = 0;
                    return;
                }

                size_t end = start + chunk_size;
                if (end > n) end = n;
                size_t len = end - start;

                // Count internal transitions and ones
                uint32_t trans = 0;
                uint32_t ones = 0;
                ones += d_data[start];

                for (size_t i = start + 1; i < end; i++) {
                    ones += d_data[i];
                    if (d_data[i] != d_data[i - 1]) {
                        trans++;
                    }
                }

                d_partial_trans[gid] = trans;
                d_boundary_first[gid] = d_data[start];
                d_boundary_last[gid] = d_data[end - 1];
                d_partial_ones[gid] = ones;
            }
        );
    });
    kernel_event.wait();

    // Copy results back to host
    std::vector<uint32_t> h_trans(global_size);
    std::vector<uint8_t> h_first(global_size);
    std::vector<uint8_t> h_last(global_size);
    std::vector<uint32_t> h_ones(global_size);

    q.memcpy(h_trans.data(), d_partial_trans, global_size * sizeof(uint32_t)).wait();
    q.memcpy(h_first.data(), d_boundary_first, global_size * sizeof(uint8_t)).wait();
    q.memcpy(h_last.data(), d_boundary_last, global_size * sizeof(uint8_t)).wait();
    q.memcpy(h_ones.data(), d_partial_ones, global_size * sizeof(uint32_t)).wait();

    // Host-side merge: sum transitions and add boundary transitions
    size_t total_trans = 0;
    size_t total_ones = 0;
    size_t active_items = num_items;

    for (size_t i = 0; i < active_items; i++) {
        total_trans += h_trans[i];
        total_ones += h_ones[i];
    }

    // Add boundary transitions between adjacent chunks
    for (size_t i = 0; i < active_items - 1; i++) {
        if (h_last[i] != h_first[i + 1]) {
            total_trans++;
        }
    }

    // Compute π
    double pi = static_cast<double>(total_ones) / static_cast<double>(n);

    // Prerequisite check
    double tau = 2.0 / std::sqrt(static_cast<double>(n));
    if (std::fabs(pi - 0.5) >= tau) {
        result.prerequisite_failed = true;
        result.p_value = 0.0;
        result.passed = false;
        result.test_stat = 0.0;
    } else {
        // V_obs = total transitions + 1
        double v_obs = static_cast<double>(total_trans + 1);

        // p-value = erfc( |V_obs - 2nπ(1-π)| / (2√(2n)·π·(1-π)) )
        double pi_1_minus_pi = pi * (1.0 - pi);
        double expected = 2.0 * static_cast<double>(n) * pi_1_minus_pi;
        double denom = 2.0 * std::sqrt(2.0 * static_cast<double>(n)) * pi_1_minus_pi;
        double p_value = nist_erfc(std::fabs(v_obs - expected) / denom);

        result.test_stat = v_obs;
        result.p_value = p_value;
        result.passed = (p_value >= ALPHA);
    }

    auto t_end = std::chrono::high_resolution_clock::now();
    result.elapsed_ms = std::chrono::duration<double, std::milli>(t_end - t_start).count();
    result.throughput_mbps = (static_cast<double>(n) / 1e6) / (result.elapsed_ms / 1000.0);

    // Get kernel execution time from SYCL profiling
    auto kernel_start = kernel_event.get_profiling_info<sycl::info::event_profiling::command_start>();
    auto kernel_end = kernel_event.get_profiling_info<sycl::info::event_profiling::command_end>();
    double kernel_ms = static_cast<double>(kernel_end - kernel_start) / 1e6;
    // Note: result.elapsed_ms includes data transfer; kernel_ms is pure compute

    // Free device memory
    sycl::free(d_data, q);
    sycl::free(d_partial_trans, q);
    sycl::free(d_boundary_first, q);
    sycl::free(d_boundary_last, q);
    sycl::free(d_partial_ones, q);

    return result;
}


// ============================================================
// SYCL Parallel Longest Run of Ones in a Block Test
// ============================================================
//
// Parallelization strategy:
//   The test naturally decomposes at the block level: each of the N
//   M-bit blocks is independent. We assign one work-group per block.
//
//   Within each work-group, work-items collaboratively scan the M bits.
//   Each work-item processes a sub-segment of the block and computes:
//     (a) Its local longest run of ones
//     (b) The length of the run of ones at the start of its segment (prefix)
//     (c) The length of the run of ones at the end of its segment (suffix)
//
//   A tree reduction within the work-group then:
//     (a) Finds the global maximum local longest run
//     (b) Merges prefix/suffix runs at segment boundaries
//
//   The resulting N longest-run values are transferred to the host for
//   the frequency table and chi-squared computation (small sequential step).
//

TestResult longest_run_test_sycl(const uint8_t* data, size_t n,
                                 size_t wg_size,
                                 const std::string& device_str) {
    TestResult result;
    result.test_name = "Longest Run of Ones";
    result.n = n;
    result.prerequisite_failed = false;

    // Step 1: Determine parameters based on n (same as sequential)
    int M, K, N_blocks, V_min;
    const double* pi_table;

    if (n >= 750000) {
        M = LR_M10000_M;  K = LR_M10000_K;  N_blocks = LR_M10000_N;
        V_min = LR_M10000_VMIN;  pi_table = LR_M10000_PI;
    } else if (n >= 6272) {
        M = LR_M128_M;  K = LR_M128_K;  N_blocks = LR_M128_N;
        V_min = LR_M128_VMIN;  pi_table = LR_M128_PI;
    } else if (n >= 128) {
        M = LR_M8_M;  K = LR_M8_K;  N_blocks = LR_M8_N;
        V_min = LR_M8_VMIN;  pi_table = LR_M8_PI;
    } else {
        result.prerequisite_failed = true;
        result.p_value = 0.0;
        result.passed = false;
        result.test_stat = 0.0;
        result.elapsed_ms = 0.0;
        result.throughput_mbps = 0.0;
        result.device_name = "N/A";
        return result;
    }

    // Select device
    sycl::device dev = select_device(device_str);
    result.device_name = device_label(dev);
    sycl::queue q(dev, sycl::property::queue::enable_profiling{});

    // Adjust wg_size: for small M (M=8), we need fewer items per work-group
    // Each work-item in a work-group handles M/wg_size bits
    // For M=8 with wg_size=256, that's < 1 bit per item — not useful
    // So we cap wg_size to M for small blocks
    size_t effective_wg_size = std::min(wg_size, static_cast<size_t>(M));
    // Also ensure it's a power of 2 for the reduction
    size_t pw2 = 1;
    while (pw2 * 2 <= effective_wg_size) pw2 *= 2;
    effective_wg_size = pw2;

    size_t global_size = static_cast<size_t>(N_blocks) * effective_wg_size;

    auto t_start = std::chrono::high_resolution_clock::now();

    // Allocate USM
    uint8_t* d_data = sycl::malloc_device<uint8_t>(n, q);
    int* d_longest = sycl::malloc_device<int>(N_blocks, q);

    q.memcpy(d_data, data, n * sizeof(uint8_t)).wait();

    int d_M = M;
    int d_N = N_blocks;
    size_t d_ewg = effective_wg_size;

    // Kernel: one work-group per M-bit block
    auto kernel_event = q.submit([&](sycl::handler& cgh) {
        // Local memory for reduction
        sycl::local_accessor<int, 1> local_max(sycl::range<1>(effective_wg_size), cgh);
        sycl::local_accessor<int, 1> local_prefix(sycl::range<1>(effective_wg_size), cgh);
        sycl::local_accessor<int, 1> local_suffix(sycl::range<1>(effective_wg_size), cgh);
        sycl::local_accessor<int, 1> local_all_ones(sycl::range<1>(effective_wg_size), cgh);

        cgh.parallel_for<class LongestRunKernel>(
            sycl::nd_range<1>(sycl::range<1>(global_size), sycl::range<1>(effective_wg_size)),
            [=](sycl::nd_item<1> item) {
                size_t group_id = item.get_group(0);
                size_t local_id = item.get_local_id(0);
                size_t local_size = item.get_local_range(0);

                if (group_id >= static_cast<size_t>(d_N)) return;

                size_t block_start = group_id * static_cast<size_t>(d_M);
                // Each work-item handles a sub-segment of the block
                size_t items_per_wi = (static_cast<size_t>(d_M) + local_size - 1) / local_size;
                size_t seg_start = block_start + local_id * items_per_wi;
                size_t seg_end = seg_start + items_per_wi;
                if (seg_end > block_start + static_cast<size_t>(d_M))
                    seg_end = block_start + static_cast<size_t>(d_M);

                // Compute local longest run, prefix run, suffix run
                int my_longest = 0;
                int my_prefix = 0;   // run of ones at start of segment
                int my_suffix = 0;   // run of ones at end of segment
                int my_all_ones = 1; // 1 if entire segment is all ones
                int current_run = 0;

                if (seg_start < seg_end) {
                    // Compute prefix: length of initial run of ones
                    for (size_t i = seg_start; i < seg_end; i++) {
                        if (d_data[i] == 1) {
                            my_prefix++;
                        } else {
                            break;
                        }
                    }

                    // Compute suffix: length of trailing run of ones
                    for (size_t i = seg_end; i > seg_start; i--) {
                        if (d_data[i - 1] == 1) {
                            my_suffix++;
                        } else {
                            break;
                        }
                    }

                    // Check if entire segment is ones
                    size_t seg_len = seg_end - seg_start;
                    my_all_ones = (my_prefix == static_cast<int>(seg_len)) ? 1 : 0;

                    // Compute longest run within segment
                    current_run = 0;
                    for (size_t i = seg_start; i < seg_end; i++) {
                        if (d_data[i] == 1) {
                            current_run++;
                            if (current_run > my_longest)
                                my_longest = current_run;
                        } else {
                            current_run = 0;
                        }
                    }
                } else {
                    my_prefix = 0;
                    my_suffix = 0;
                    my_all_ones = 1;  // empty segment counts as "all ones" for merging
                    my_longest = 0;
                }

                local_max[local_id] = my_longest;
                local_prefix[local_id] = my_prefix;
                local_suffix[local_id] = my_suffix;
                local_all_ones[local_id] = my_all_ones;

                sycl::group_barrier(item.get_group());

                // Tree reduction to find global max, merging boundary runs
                // At each level, adjacent pairs merge:
                //   - The merged run at the boundary = suffix[left] + prefix[right]
                //     (if left ends with ones that continue into right)
                //   - The merged max = max(max_left, max_right, boundary_run)
                //   - New prefix = prefix_left if left is all-ones: prefix_left + prefix_right
                //   - New suffix = suffix_right if right is all-ones: suffix_right + suffix_left
                for (size_t stride = 1; stride < local_size; stride *= 2) {
                    if (local_id % (2 * stride) == 0 && (local_id + stride) < local_size) {
                        size_t left = local_id;
                        size_t right = local_id + stride;

                        // Boundary run: suffix of left + prefix of right
                        int boundary = local_suffix[left] + local_prefix[right];

                        // New max
                        int new_max = local_max[left];
                        if (local_max[right] > new_max) new_max = local_max[right];
                        if (boundary > new_max) new_max = boundary;
                        local_max[left] = new_max;

                        // New prefix: if left was all-ones, extend into right
                        if (local_all_ones[left]) {
                            local_prefix[left] = local_prefix[left] + local_prefix[right];
                        }
                        // else prefix stays as-is

                        // New suffix: if right was all-ones, extend into left
                        if (local_all_ones[right]) {
                            local_suffix[left] = local_suffix[right] + local_suffix[left];
                        } else {
                            local_suffix[left] = local_suffix[right];
                        }

                        // New all_ones: both must be all-ones
                        local_all_ones[left] = local_all_ones[left] && local_all_ones[right];
                    }
                    sycl::group_barrier(item.get_group());
                }

                // Work-item 0 writes the block result
                if (local_id == 0) {
                    d_longest[group_id] = local_max[0];
                }
            }
        );
    });
    kernel_event.wait();

    // Copy results back
    std::vector<int> h_longest(N_blocks);
    q.memcpy(h_longest.data(), d_longest, N_blocks * sizeof(int)).wait();

    // Host: build frequency table and compute chi-squared
    std::vector<int> freq(K + 1, 0);
    for (int i = 0; i < N_blocks; i++) {
        int lr = h_longest[i];
        if (lr <= V_min) {
            freq[0]++;
        } else if (lr >= V_min + K) {
            freq[K]++;
        } else {
            freq[lr - V_min]++;
        }
    }

    double chi2 = 0.0;
    for (int i = 0; i <= K; i++) {
        double expected = static_cast<double>(N_blocks) * pi_table[i];
        double diff = static_cast<double>(freq[i]) - expected;
        chi2 += (diff * diff) / expected;
    }

    double p_value = igamc(static_cast<double>(K) / 2.0, chi2 / 2.0);

    auto t_end = std::chrono::high_resolution_clock::now();

    result.test_stat = chi2;
    result.p_value = p_value;
    result.passed = (p_value >= ALPHA);
    result.elapsed_ms = std::chrono::duration<double, std::milli>(t_end - t_start).count();
    result.throughput_mbps = (static_cast<double>(n) / 1e6) / (result.elapsed_ms / 1000.0);

    // Free device memory
    sycl::free(d_data, q);
    sycl::free(d_longest, q);

    return result;
}
