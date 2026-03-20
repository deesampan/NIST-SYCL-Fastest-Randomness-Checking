/**
 * main_seq.cpp - Sequential-only main (no SYCL dependency)
 *
 * This version can be compiled with any C++17 compiler (g++, clang++)
 * and runs only the sequential baseline implementations.
 *
 * Compile:
 *   g++ -std=c++17 -O2 -o nist_seq src/main_seq.cpp src/sequential.cpp \
 *       src/math_utils.cpp src/io_utils.cpp -Iinclude -lm
 */

#include "nist_tests.h"
#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>

// Stub SYCL functions (not available in this build)
TestResult runs_test_sycl(const uint8_t*, size_t, size_t, const std::string&) {
    TestResult r;
    r.test_name = "Runs Test (SYCL)";
    r.device_name = "N/A - Sequential-only build";
    r.n = 0; r.p_value = 0; r.passed = false;
    r.elapsed_ms = 0; r.throughput_mbps = 0;
    r.test_stat = 0; r.prerequisite_failed = true;
    return r;
}

TestResult longest_run_test_sycl(const uint8_t*, size_t, size_t, const std::string&) {
    TestResult r;
    r.test_name = "Longest Run of Ones (SYCL)";
    r.device_name = "N/A - Sequential-only build";
    r.n = 0; r.p_value = 0; r.passed = false;
    r.elapsed_ms = 0; r.throughput_mbps = 0;
    r.test_stat = 0; r.prerequisite_failed = true;
    return r;
}

int main(int argc, char* argv[]) {
    std::string test_type = "all";
    size_t gen_length = 0;
    uint64_t seed = 42;
    std::string input_file;
    size_t max_bits = 0;
    bool is_binary = false;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--generate" && i + 1 < argc) {
            gen_length = std::stoull(argv[++i]);
        } else if (arg == "--seed" && i + 1 < argc) {
            seed = std::stoull(argv[++i]);
        } else if (arg == "--test" && i + 1 < argc) {
            test_type = argv[++i];
        } else if (arg == "--length" && i + 1 < argc) {
            max_bits = std::stoull(argv[++i]);
        } else if (arg == "--binary") {
            is_binary = true;
        } else if (arg == "--help") {
            std::cout << "Usage: nist_seq [--generate N] [--seed S] [--test runs|longestrun|all] "
                      << "[--binary] [--length N] <input_file>\n";
            return 0;
        } else if (arg[0] != '-') {
            input_file = arg;
        }
    }

    std::vector<uint8_t> seq;
    if (gen_length > 0) {
        std::cout << "Generating " << gen_length << " random bits (seed=" << seed << ")\n";
        seq = generate_random_sequence(gen_length, seed);
    } else if (!input_file.empty()) {
        seq = read_sequence(input_file, max_bits, is_binary);
    } else {
        std::cerr << "Error: provide --generate N or an input file.\n";
        return 1;
    }

    std::cout << "Sequence length: " << seq.size() << " bits\n\n";

    if (test_type == "runs" || test_type == "all") {
        auto r = runs_test_sequential(seq.data(), seq.size());
        print_result_text(r);
    }
    if (test_type == "longestrun" || test_type == "all") {
        auto r = longest_run_test_sequential(seq.data(), seq.size());
        print_result_text(r);
    }

    return 0;
}
