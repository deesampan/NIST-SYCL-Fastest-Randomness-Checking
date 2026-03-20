/**
 * sequential.cpp - Sequential C++17 implementations of NIST SP 800-22 tests
 *
 * Implements:
 *   1. Runs Test (Section 2.3)
 *   2. Longest Run of Ones in a Block Test (Section 2.4)
 *
 * These serve as the correctness baseline for validation against NIST
 * reference test vectors, and as the performance baseline for speedup
 * measurement against the SYCL parallel implementations.
 */

#include "nist_tests.h"
#include <chrono>
#include <cmath>
#include <algorithm>

// ============================================================
// Runs Test - Sequential (NIST SP 800-22 Section 2.3)
// ============================================================
//
// Algorithm:
//   1. Compute π = (sum of bits) / n
//   2. Check prerequisite: |π - 0.5| < τ, where τ = 2/√n
//      If prerequisite fails, p-value = 0.0
//   3. Count V_obs = total number of runs (transitions + 1)
//      V_obs = 1 + Σ_{k=1}^{n-1} r(k), where r(k) = (ε_k ≠ ε_{k+1}) ? 1 : 0
//   4. Compute p-value = erfc( |V_obs - 2nπ(1-π)| / (2√(2n) · π(1-π)) )
//   5. If p-value >= 0.01, sequence passes.
//

TestResult runs_test_sequential(const uint8_t* data, size_t n) {
    TestResult result;
    result.test_name = "Runs Test";
    result.device_name = "CPU-Sequential";
    result.n = n;
    result.prerequisite_failed = false;

    auto t_start = std::chrono::high_resolution_clock::now();

    // Step 1: Compute proportion of ones (π)
    size_t ones_count = 0;
    for (size_t i = 0; i < n; i++) {
        ones_count += data[i];
    }
    double pi = static_cast<double>(ones_count) / static_cast<double>(n);

    // Step 2: Prerequisite check — |π - 0.5| < τ = 2/√n
    double tau = 2.0 / std::sqrt(static_cast<double>(n));
    if (std::fabs(pi - 0.5) >= tau) {
        // Prerequisite failed: frequency test would not pass
        result.prerequisite_failed = true;
        result.p_value = 0.0;
        result.passed = false;
        result.test_stat = 0.0;
        auto t_end = std::chrono::high_resolution_clock::now();
        result.elapsed_ms = std::chrono::duration<double, std::milli>(t_end - t_start).count();
        result.throughput_mbps = (static_cast<double>(n) / 1e6) / (result.elapsed_ms / 1000.0);
        return result;
    }

    // Step 3: Count total number of runs V_obs
    // V_obs = 1 + number of transitions (positions where ε_k ≠ ε_{k+1})
    size_t transitions = 0;
    for (size_t i = 0; i < n - 1; i++) {
        if (data[i] != data[i + 1]) {
            transitions++;
        }
    }
    double v_obs = static_cast<double>(transitions + 1);

    // Step 4: Compute p-value
    // p-value = erfc( |V_obs - 2nπ(1-π)| / (2·√(2n)·π·(1-π)) )
    double pi_1_minus_pi = pi * (1.0 - pi);
    double expected = 2.0 * static_cast<double>(n) * pi_1_minus_pi;
    double denom = 2.0 * std::sqrt(2.0 * static_cast<double>(n)) * pi_1_minus_pi;
    double p_value = nist_erfc(std::fabs(v_obs - expected) / denom);

    auto t_end = std::chrono::high_resolution_clock::now();

    result.test_stat = v_obs;
    result.p_value = p_value;
    result.passed = (p_value >= ALPHA);
    result.elapsed_ms = std::chrono::duration<double, std::milli>(t_end - t_start).count();
    result.throughput_mbps = (static_cast<double>(n) / 1e6) / (result.elapsed_ms / 1000.0);

    return result;
}

// ============================================================
// Longest Run of Ones in a Block - Sequential
// (NIST SP 800-22 Section 2.4)
// ============================================================
//
// Algorithm:
//   1. Determine M, K, N, π_i values based on sequence length n.
//   2. Divide sequence into N blocks of M bits each.
//   3. For each block, find the longest run of consecutive ones.
//   4. Tabulate frequencies ν_i into K+1 categories.
//   5. Compute χ² = Σ (ν_i - N·π_i)² / (N·π_i)
//   6. Compute p-value = igamc(K/2, χ²/2)
//   7. If p-value >= 0.01, sequence passes.
//

TestResult longest_run_test_sequential(const uint8_t* data, size_t n) {
    TestResult result;
    result.test_name = "Longest Run of Ones";
    result.device_name = "CPU-Sequential";
    result.n = n;
    result.prerequisite_failed = false;

    auto t_start = std::chrono::high_resolution_clock::now();

    // Step 1: Determine parameters based on n
    int M, K, N, V_min;
    const double* pi_table;

    if (n >= 750000) {
        M = LR_M10000_M;  K = LR_M10000_K;  N = LR_M10000_N;
        V_min = LR_M10000_VMIN;  pi_table = LR_M10000_PI;
    } else if (n >= 6272) {
        M = LR_M128_M;  K = LR_M128_K;  N = LR_M128_N;
        V_min = LR_M128_VMIN;  pi_table = LR_M128_PI;
    } else if (n >= 128) {
        M = LR_M8_M;  K = LR_M8_K;  N = LR_M8_N;
        V_min = LR_M8_VMIN;  pi_table = LR_M8_PI;
    } else {
        // Sequence too short for this test
        result.prerequisite_failed = true;
        result.p_value = 0.0;
        result.passed = false;
        result.test_stat = 0.0;
        auto t_end = std::chrono::high_resolution_clock::now();
        result.elapsed_ms = std::chrono::duration<double, std::milli>(t_end - t_start).count();
        result.throughput_mbps = (static_cast<double>(n) / 1e6) / (result.elapsed_ms / 1000.0);
        return result;
    }

    // Step 2 & 3: For each of the N blocks, find longest run of ones
    std::vector<int> freq(K + 1, 0);  // Frequency table ν_0, ν_1, ..., ν_K

    for (int block = 0; block < N; block++) {
        size_t block_start = static_cast<size_t>(block) * static_cast<size_t>(M);
        int longest = 0;
        int current_run = 0;

        for (int j = 0; j < M; j++) {
            if (data[block_start + j] == 1) {
                current_run++;
                if (current_run > longest) {
                    longest = current_run;
                }
            } else {
                current_run = 0;
            }
        }

        // Step 4: Classify into frequency categories
        // For M=8: categories are {≤1}, {2}, {3}, {≥4}
        // For M=128: categories are {≤4}, {5}, {6}, {7}, {8}, {≥9}
        // For M=10000: categories are {≤10}, {11}, {12}, {13}, {14}, {15}, {≥16}
        if (longest <= V_min) {
            freq[0]++;
        } else if (longest >= V_min + K) {
            freq[K]++;
        } else {
            freq[longest - V_min]++;
        }
    }

    // Step 5: Compute chi-squared statistic
    double chi2 = 0.0;
    for (int i = 0; i <= K; i++) {
        double expected = static_cast<double>(N) * pi_table[i];
        double diff = static_cast<double>(freq[i]) - expected;
        chi2 += (diff * diff) / expected;
    }

    // Step 6: Compute p-value = igamc(K/2, chi2/2)
    double p_value = igamc(static_cast<double>(K) / 2.0, chi2 / 2.0);

    auto t_end = std::chrono::high_resolution_clock::now();

    result.test_stat = chi2;
    result.p_value = p_value;
    result.passed = (p_value >= ALPHA);
    result.elapsed_ms = std::chrono::duration<double, std::milli>(t_end - t_start).count();
    result.throughput_mbps = (static_cast<double>(n) / 1e6) / (result.elapsed_ms / 1000.0);

    return result;
}
