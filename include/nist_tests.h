/**
 * SYCL-based Parallel Implementation of NIST SP 800-22 Runs Test
 * and Longest Run of Ones in a Block Test
 *
 * Author: Deesampan Vongsurit (陆善缘)
 * Supervisor: Guanlin He (何冠霖)
 * Xihua University - School of Computer and Software Engineering
 *
 * This header defines the common data structures, constants, and
 * function interfaces for both sequential and SYCL parallel
 * implementations of the NIST SP 800-22 statistical tests.
 */

#ifndef NIST_TESTS_H
#define NIST_TESTS_H

#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include <cmath>
#include <chrono>

// ============================================================
// Constants from NIST SP 800-22 Rev 1a
// ============================================================

constexpr double ALPHA = 0.01;  // Significance level
constexpr size_t MIN_LENGTH = 100;  // Minimum sequence length for Runs Test

// Longest Run of Ones: Table parameters from NIST SP 800-22 Section 2.4 & 3.4
// K=3, M=8 (for n >= 128)
constexpr int LR_M8_K = 3;
constexpr int LR_M8_M = 8;
constexpr int LR_M8_N = 16;
constexpr double LR_M8_PI[4] = {0.2148, 0.3672, 0.2305, 0.1875};
constexpr int LR_M8_VMIN = 1;  // v0 class: longest run <= 1

// K=5, M=128 (for n >= 6272)
constexpr int LR_M128_K = 5;
constexpr int LR_M128_M = 128;
constexpr int LR_M128_N = 49;
constexpr double LR_M128_PI[6] = {0.1174, 0.2430, 0.2493, 0.1752, 0.1027, 0.1124};
constexpr int LR_M128_VMIN = 4;  // v0 class: longest run <= 4

// K=6, M=10000 (for n >= 750000)
constexpr int LR_M10000_K = 6;
constexpr int LR_M10000_M = 10000;
constexpr int LR_M10000_N = 75;
constexpr double LR_M10000_PI[7] = {0.0882, 0.2092, 0.2483, 0.1933, 0.1208, 0.0675, 0.0727};
constexpr int LR_M10000_VMIN = 10;  // v0 class: longest run <= 10

// ============================================================
// Result structures
// ============================================================

struct TestResult {
    std::string test_name;
    size_t n;                // Sequence length
    double p_value;          // Computed p-value
    bool passed;             // true if p_value >= ALPHA
    double elapsed_ms;       // Wall-clock time in milliseconds
    double throughput_mbps;  // Throughput in Mbits/s
    std::string device_name; // "CPU-Sequential", "SYCL-CPU", "SYCL-GPU", etc.
    // Additional info
    double test_stat;        // V_obs for Runs, chi2 for Longest Run
    bool prerequisite_failed;
};

// ============================================================
// Special math functions (Section 5.5.3 of NIST SP 800-22)
// ============================================================

/**
 * Complementary error function - erfc(x)
 * Used in the Runs Test p-value computation.
 */
inline double nist_erfc(double x) {
    return std::erfc(x);
}

/**
 * Upper incomplete gamma function Q(a,x) = igamc(a,x)
 * Used in the Longest Run of Ones test p-value computation.
 * P-value = igamc(K/2, chi2/2)
 *
 * Implementation uses the series/continued fraction approach.
 */
double igamc(double a, double x);

// ============================================================
// Input utilities
// ============================================================

/**
 * Read a binary sequence from a file.
 * Supports formats:
 *   - ASCII '0'/'1' characters (one per byte)
 *   - Raw binary file (bits packed 8 per byte, MSB first)
 *
 * @param filename Path to input file
 * @param max_bits Maximum number of bits to read (0 = read all)
 * @param is_binary If true, treat file as packed binary; else ASCII '0'/'1'
 * @return Vector of uint8_t, each element is 0 or 1
 */
std::vector<uint8_t> read_sequence(const std::string& filename, size_t max_bits = 0, bool is_binary = false);

/**
 * Generate a random binary sequence using std::mt19937_64 for testing.
 */
std::vector<uint8_t> generate_random_sequence(size_t n, uint64_t seed = 42);

// ============================================================
// Sequential implementations (C++17 baseline)
// ============================================================

/**
 * Sequential Runs Test (NIST SP 800-22 Section 2.3)
 */
TestResult runs_test_sequential(const uint8_t* data, size_t n);

/**
 * Sequential Longest Run of Ones in a Block Test (NIST SP 800-22 Section 2.4)
 */
TestResult longest_run_test_sequential(const uint8_t* data, size_t n);

// ============================================================
// SYCL parallel implementations
// ============================================================

/**
 * SYCL Parallel Runs Test
 * Uses segmented parallel reduction to count transitions.
 *
 * @param data       Pointer to bit array (each byte is 0 or 1)
 * @param n          Number of bits
 * @param wg_size    Work-group size (default 256)
 * @param device_str Device selector: "cpu", "gpu", or "auto"
 */
TestResult runs_test_sycl(const uint8_t* data, size_t n,
                          size_t wg_size = 256,
                          const std::string& device_str = "auto");

/**
 * SYCL Parallel Longest Run of Ones in a Block Test
 * Uses block-parallel reduction with local memory.
 *
 * @param data       Pointer to bit array (each byte is 0 or 1)
 * @param n          Number of bits
 * @param wg_size    Work-group size (default 256)
 * @param device_str Device selector: "cpu", "gpu", or "auto"
 */
TestResult longest_run_test_sycl(const uint8_t* data, size_t n,
                                 size_t wg_size = 256,
                                 const std::string& device_str = "auto");

// ============================================================
// Output utilities
// ============================================================

/**
 * Print a test result in human-readable text format.
 */
void print_result_text(const TestResult& result);

/**
 * Print a CSV header line.
 */
void print_csv_header();

/**
 * Print a test result as a CSV line.
 */
void print_result_csv(const TestResult& result);

#endif // NIST_TESTS_H
