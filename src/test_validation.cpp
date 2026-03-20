/**
 * test_validation.cpp - Validation against NIST SP 800-22 reference test vectors
 *
 * This program validates the sequential and SYCL implementations against
 * the known test vectors from NIST SP 800-22 Rev 1a.
 *
 * Reference vectors:
 *   1. Runs Test (Section 2.3.8):
 *      ε = 11001001000011111101101010100010001000010110100011
 *          00001000110100110001001100011001100010100010111000
 *      n = 100, Expected P-value = 0.500798
 *
 *   2. Longest Run of Ones (Section 2.4.8):
 *      ε = 11001100000101010110110001001100111000000000001001
 *          00110101010001000100111101011010000000110101111100
 *          1100111001101101100010110010
 *      n = 128, Expected P-value = 0.180609 (K=3, M=8)
 */

#include "nist_tests.h"
#include <iostream>
#include <iomanip>
#include <cmath>
#include <cstring>
#include <vector>
#include <string>

// Convert a string of '0'/'1' characters to a uint8_t array
static std::vector<uint8_t> str_to_bits(const std::string& s) {
    std::vector<uint8_t> bits;
    for (char c : s) {
        if (c == '0' || c == '1') {
            bits.push_back(static_cast<uint8_t>(c - '0'));
        }
    }
    return bits;
}

static bool check_pvalue(const std::string& test_name, double computed, double expected,
                         double tolerance = 1e-4) {
    double diff = std::fabs(computed - expected);
    bool ok = diff < tolerance;
    std::cout << "  " << test_name << ": computed=" << std::fixed << std::setprecision(6)
              << computed << ", expected=" << expected
              << ", diff=" << std::scientific << std::setprecision(2) << diff
              << " " << (ok ? "[PASS]" : "[FAIL]") << "\n" << std::fixed;
    return ok;
}

int main() {
    int total = 0, passed = 0;

    std::cout << "=== NIST SP 800-22 Validation Tests ===\n\n";

    // ================================================================
    // Test 1: Runs Test - NIST reference vector (Section 2.3.8)
    // ================================================================
    std::cout << "--- Test 1: Runs Test (NIST Section 2.3.8) ---\n";
    {
        std::string eps_str =
            "11001001000011111101101010100010001000010110100011"
            "00001000110100110001001100011001100010100010111000";
        auto bits = str_to_bits(eps_str);
        // n = 100
        // Expected: V_obs counted from transitions
        // Expected P-value = 0.500798

        // Sequential
        auto seq_result = runs_test_sequential(bits.data(), bits.size());
        total++;
        if (check_pvalue("Sequential Runs", seq_result.p_value, 0.500798)) passed++;

        // SYCL
        auto sycl_result = runs_test_sycl(bits.data(), bits.size(), 32, "cpu");
        total++;
        if (check_pvalue("SYCL Runs", sycl_result.p_value, 0.500798)) passed++;

        // Cross-check: sequential vs SYCL
        total++;
        double cross_diff = std::fabs(seq_result.p_value - sycl_result.p_value);
        bool cross_ok = cross_diff < 1e-6;
        std::cout << "  Sequential vs SYCL: diff=" << std::scientific
                  << std::setprecision(2) << cross_diff
                  << " " << (cross_ok ? "[PASS]" : "[FAIL]") << "\n" << std::fixed;
        if (cross_ok) passed++;
    }
    std::cout << "\n";

    // ================================================================
    // Test 2: Runs Test - small example (Section 2.3.4)
    // ================================================================
    std::cout << "--- Test 2: Runs Test (NIST Section 2.3.4 example) ---\n";
    {
        std::string eps_str = "1001101011";
        auto bits = str_to_bits(eps_str);
        // n=10, π=6/10=0.6, V_obs=7
        // Expected P-value = 0.147232

        auto seq_result = runs_test_sequential(bits.data(), bits.size());
        // Note: n=10 < 100, but the algorithm still runs
        // The prerequisite τ = 2/√10 ≈ 0.6325, |π-0.5| = 0.1 < 0.6325 → OK
        total++;
        if (check_pvalue("Sequential Runs (small)", seq_result.p_value, 0.147232, 1e-3)) passed++;

        auto sycl_result = runs_test_sycl(bits.data(), bits.size(), 4, "cpu");
        total++;
        if (check_pvalue("SYCL Runs (small)", sycl_result.p_value, 0.147232, 1e-3)) passed++;
    }
    std::cout << "\n";

    // ================================================================
    // Test 3: Longest Run of Ones - NIST reference vector (Section 2.4.8)
    // ================================================================
    std::cout << "--- Test 3: Longest Run of Ones (NIST Section 2.4.8) ---\n";
    {
        std::string eps_str =
            "11001100000101010110110001001100111000000000001001"
            "00110101010001000100111101011010000000110101111100"
            "1100111001101101100010110010";
        auto bits = str_to_bits(eps_str);
        // n = 128, M=8, K=3, N=16
        // Expected: χ² ≈ 4.882457 (or 4.882605 per section 3.4)
        // Expected P-value = 0.180609

        auto seq_result = longest_run_test_sequential(bits.data(), bits.size());
        total++;
        if (check_pvalue("Sequential LongestRun", seq_result.p_value, 0.180609, 1e-3)) passed++;

        auto sycl_result = longest_run_test_sycl(bits.data(), bits.size(), 4, "cpu");
        total++;
        if (check_pvalue("SYCL LongestRun", sycl_result.p_value, 0.180609, 1e-3)) passed++;

        // Cross-check
        total++;
        double cross_diff = std::fabs(seq_result.p_value - sycl_result.p_value);
        bool cross_ok = cross_diff < 1e-6;
        std::cout << "  Sequential vs SYCL: diff=" << std::scientific
                  << std::setprecision(2) << cross_diff
                  << " " << (cross_ok ? "[PASS]" : "[FAIL]") << "\n" << std::fixed;
        if (cross_ok) passed++;
    }
    std::cout << "\n";

    // ================================================================
    // Test 4: Large random sequence - consistency check
    // ================================================================
    std::cout << "--- Test 4: Large sequence consistency (1M bits) ---\n";
    {
        auto bits = generate_random_sequence(1000000, 12345);

        auto seq_runs = runs_test_sequential(bits.data(), bits.size());
        auto sycl_runs = runs_test_sycl(bits.data(), bits.size(), 256, "cpu");
        total++;
        double diff_runs = std::fabs(seq_runs.p_value - sycl_runs.p_value);
        bool ok_runs = diff_runs < 1e-6;
        std::cout << "  Runs 1M seq=" << std::fixed << std::setprecision(6) << seq_runs.p_value
                  << " sycl=" << sycl_runs.p_value
                  << " diff=" << std::scientific << std::setprecision(2) << diff_runs
                  << " " << (ok_runs ? "[PASS]" : "[FAIL]") << "\n" << std::fixed;
        if (ok_runs) passed++;

        auto seq_lr = longest_run_test_sequential(bits.data(), bits.size());
        auto sycl_lr = longest_run_test_sycl(bits.data(), bits.size(), 256, "cpu");
        total++;
        double diff_lr = std::fabs(seq_lr.p_value - sycl_lr.p_value);
        bool ok_lr = diff_lr < 1e-6;
        std::cout << "  LongestRun 1M seq=" << std::fixed << std::setprecision(6) << seq_lr.p_value
                  << " sycl=" << sycl_lr.p_value
                  << " diff=" << std::scientific << std::setprecision(2) << diff_lr
                  << " " << (ok_lr ? "[PASS]" : "[FAIL]") << "\n" << std::fixed;
        if (ok_lr) passed++;
    }
    std::cout << "\n";

    // ================================================================
    // Test 5: Prerequisite failure test (all ones)
    // ================================================================
    std::cout << "--- Test 5: Prerequisite failure (all ones, n=100) ---\n";
    {
        std::vector<uint8_t> bits(100, 1);
        auto seq_result = runs_test_sequential(bits.data(), bits.size());
        total++;
        bool ok = seq_result.prerequisite_failed && seq_result.p_value == 0.0;
        std::cout << "  Prerequisite failed: " << (seq_result.prerequisite_failed ? "yes" : "no")
                  << ", p_value=" << seq_result.p_value
                  << " " << (ok ? "[PASS]" : "[FAIL]") << "\n";
        if (ok) passed++;
    }
    std::cout << "\n";

    // ================================================================
    // Test 6: igamc function validation
    // ================================================================
    std::cout << "--- Test 6: igamc() function validation ---\n";
    {
        // From NIST Section 2.4.8: igamc(3/2, 4.882605/2) = 0.180598
        total++;
        double val = igamc(1.5, 4.882605 / 2.0);
        bool ok = std::fabs(val - 0.180598) < 1e-4;
        std::cout << "  igamc(1.5, 2.441) = " << std::fixed << std::setprecision(6) << val
                  << " expected=0.180598 " << (ok ? "[PASS]" : "[FAIL]") << "\n";
        if (ok) passed++;

        // From Section 2.2.4: igamc(3/2, 1/2) = 0.801252
        total++;
        val = igamc(1.5, 0.5);
        ok = std::fabs(val - 0.801252) < 1e-4;
        std::cout << "  igamc(1.5, 0.5) = " << val
                  << " expected=0.801252 " << (ok ? "[PASS]" : "[FAIL]") << "\n";
        if (ok) passed++;
    }
    std::cout << "\n";

    // ================================================================
    // Summary
    // ================================================================
    std::cout << "=== SUMMARY: " << passed << "/" << total << " tests passed ===\n";
    return (passed == total) ? 0 : 1;
}
