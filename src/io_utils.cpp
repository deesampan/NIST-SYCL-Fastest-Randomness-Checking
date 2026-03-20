/**
 * io_utils.cpp - Input/Output utilities
 *
 * Handles reading binary sequences from files (ASCII or packed binary),
 * generating test sequences, and formatting output.
 */

#include "nist_tests.h"
#include <fstream>
#include <iostream>
#include <iomanip>
#include <random>
#include <algorithm>

// ============================================================
// Input
// ============================================================

std::vector<uint8_t> read_sequence(const std::string& filename, size_t max_bits, bool is_binary) {
    std::vector<uint8_t> seq;

    std::ifstream ifs(filename, is_binary ? std::ios::binary : std::ios::in);
    if (!ifs.is_open()) {
        throw std::runtime_error("Cannot open file: " + filename);
    }

    if (is_binary) {
        // Read raw binary: each byte contains 8 bits, MSB first
        char byte;
        while (ifs.get(byte)) {
            for (int bit = 7; bit >= 0; --bit) {
                seq.push_back(static_cast<uint8_t>((byte >> bit) & 1));
                if (max_bits > 0 && seq.size() >= max_bits) {
                    return seq;
                }
            }
        }
    } else {
        // Read ASCII '0' and '1' characters
        char ch;
        while (ifs.get(ch)) {
            if (ch == '0' || ch == '1') {
                seq.push_back(static_cast<uint8_t>(ch - '0'));
                if (max_bits > 0 && seq.size() >= max_bits) {
                    return seq;
                }
            }
            // Skip whitespace and other characters
        }
    }

    return seq;
}

std::vector<uint8_t> generate_random_sequence(size_t n, uint64_t seed) {
    std::vector<uint8_t> seq(n);
    std::mt19937_64 rng(seed);
    std::uniform_int_distribution<int> dist(0, 1);
    for (size_t i = 0; i < n; i++) {
        seq[i] = static_cast<uint8_t>(dist(rng));
    }
    return seq;
}

// ============================================================
// Output
// ============================================================

void print_result_text(const TestResult& result) {
    std::cout << "========================================\n";
    std::cout << "Test:           " << result.test_name << "\n";
    std::cout << "Device:         " << result.device_name << "\n";
    std::cout << "Sequence Len:   " << result.n << " bits\n";
    if (result.prerequisite_failed) {
        std::cout << "Status:         PREREQUISITE FAILED (Frequency test not passed)\n";
        std::cout << "P-value:        0.000000\n";
    } else {
        std::cout << std::fixed << std::setprecision(6);
        std::cout << "Test Statistic: " << result.test_stat << "\n";
        std::cout << "P-value:        " << result.p_value << "\n";
        std::cout << "Result:         " << (result.passed ? "PASS" : "FAIL") << "\n";
    }
    std::cout << std::fixed << std::setprecision(3);
    std::cout << "Time:           " << result.elapsed_ms << " ms\n";
    std::cout << "Throughput:     " << result.throughput_mbps << " Mbits/s\n";
    std::cout << "========================================\n";
}

void print_csv_header() {
    std::cout << "test_name,device,n,test_stat,p_value,result,time_ms,throughput_mbps\n";
}

void print_result_csv(const TestResult& result) {
    std::cout << result.test_name << ","
              << result.device_name << ","
              << result.n << ","
              << std::fixed << std::setprecision(6) << result.test_stat << ","
              << result.p_value << ","
              << (result.prerequisite_failed ? "PREREQ_FAIL" : (result.passed ? "PASS" : "FAIL")) << ","
              << std::setprecision(3) << result.elapsed_ms << ","
              << result.throughput_mbps << "\n";
}
