/**
 * main.cpp - NIST SP 800-22 Randomness Test Suite (SYCL Parallel)
 *
 * Command-line interface for running the Runs Test and Longest Run of Ones
 * in a Block Test, in both sequential and SYCL parallel modes.
 *
 * Usage:
 *   ./nist_sycl [OPTIONS] <input_file>
 *   ./nist_sycl --generate N [OPTIONS]
 *
 * Options:
 *   --device cpu|gpu|auto    Select SYCL device (default: auto)
 *   --test runs|longestrun|all   Select test (default: all)
 *   --length N               Read only first N bits from input
 *   --workgroup W            Work-group size (default: 256)
 *   --format text|csv        Output format (default: text)
 *   --binary                 Treat input as packed binary (not ASCII 0/1)
 *   --generate N             Generate random N-bit sequence (no input file)
 *   --seed S                 Random seed for --generate (default: 42)
 *   --sequential-only        Run only the sequential baseline
 *   --sycl-only              Run only the SYCL parallel version
 *   --benchmark              Run both and report speedup comparison
 *   --help                   Show this help
 */

#include "nist_tests.h"
#include <iostream>
#include <iomanip>
#include <string>
#include <vector>
#include <cstring>
#include <cstdlib>

struct Config {
    std::string input_file;
    std::string device = "auto";
    std::string test = "all";          // "runs", "longestrun", "all"
    std::string format = "text";       // "text", "csv"
    size_t length = 0;                 // 0 = read all
    size_t wg_size = 256;
    bool is_binary = false;
    bool generate = false;
    size_t gen_length = 0;
    uint64_t seed = 42;
    bool seq_only = false;
    bool sycl_only = false;
    bool benchmark = false;
};

static void print_help() {
    std::cout << R"(
NIST SP 800-22 Randomness Test Suite - SYCL Parallel Implementation
====================================================================

Usage:
  ./nist_sycl [OPTIONS] <input_file>
  ./nist_sycl --generate N [OPTIONS]

Tests implemented:
  - Runs Test (Section 2.3)
  - Longest Run of Ones in a Block Test (Section 2.4)

Options:
  --device cpu|gpu|auto   SYCL device selection (default: auto)
  --test runs|longestrun|all  Test to run (default: all)
  --length N              Use only first N bits from input
  --workgroup W           Work-group size: 32,64,128,256,512 (default: 256)
  --format text|csv       Output format (default: text)
  --binary                Input file is packed binary (default: ASCII 0/1)
  --generate N            Generate random N-bit test sequence
  --seed S                RNG seed for --generate (default: 42)
  --sequential-only       Run sequential C++ baseline only
  --sycl-only             Run SYCL parallel version only
  --benchmark             Run both versions and show speedup
  --help                  Show this help message

Examples:
  ./nist_sycl --generate 1000000 --benchmark
  ./nist_sycl --device gpu --test runs input.txt
  ./nist_sycl --format csv --generate 10000000 --benchmark > results.csv
  ./nist_sycl --binary --length 1000000 random.bin

Input format:
  Default: ASCII file with '0' and '1' characters (whitespace ignored)
  --binary: Raw binary file (bits packed 8 per byte, MSB first)
)" << std::endl;
}

static Config parse_args(int argc, char* argv[]) {
    Config cfg;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];

        if (arg == "--help" || arg == "-h") {
            print_help();
            std::exit(0);
        } else if (arg == "--device" && i + 1 < argc) {
            cfg.device = argv[++i];
        } else if (arg == "--test" && i + 1 < argc) {
            cfg.test = argv[++i];
        } else if (arg == "--length" && i + 1 < argc) {
            cfg.length = std::stoull(argv[++i]);
        } else if (arg == "--workgroup" && i + 1 < argc) {
            cfg.wg_size = std::stoull(argv[++i]);
        } else if (arg == "--format" && i + 1 < argc) {
            cfg.format = argv[++i];
        } else if (arg == "--binary") {
            cfg.is_binary = true;
        } else if (arg == "--generate" && i + 1 < argc) {
            cfg.generate = true;
            cfg.gen_length = std::stoull(argv[++i]);
        } else if (arg == "--seed" && i + 1 < argc) {
            cfg.seed = std::stoull(argv[++i]);
        } else if (arg == "--sequential-only") {
            cfg.seq_only = true;
        } else if (arg == "--sycl-only") {
            cfg.sycl_only = true;
        } else if (arg == "--benchmark") {
            cfg.benchmark = true;
        } else if (arg[0] != '-') {
            cfg.input_file = arg;
        } else {
            std::cerr << "Unknown option: " << arg << "\n";
            std::cerr << "Use --help for usage information.\n";
            std::exit(1);
        }
    }

    if (!cfg.generate && cfg.input_file.empty()) {
        std::cerr << "Error: No input file specified. Use --generate N or provide a file.\n";
        std::cerr << "Use --help for usage information.\n";
        std::exit(1);
    }

    return cfg;
}

int main(int argc, char* argv[]) {
    Config cfg = parse_args(argc, argv);

    // Load or generate sequence
    std::vector<uint8_t> sequence;
    if (cfg.generate) {
        std::cout << "Generating random sequence: " << cfg.gen_length
                  << " bits (seed=" << cfg.seed << ")\n";
        sequence = generate_random_sequence(cfg.gen_length, cfg.seed);
    } else {
        sequence = read_sequence(cfg.input_file, cfg.length, cfg.is_binary);
    }

    size_t n = sequence.size();
    if (n < MIN_LENGTH) {
        std::cerr << "Error: Sequence length " << n << " is less than minimum "
                  << MIN_LENGTH << " bits.\n";
        return 1;
    }

    std::cout << "Sequence length: " << n << " bits\n\n";

    const uint8_t* data = sequence.data();
    bool run_runs = (cfg.test == "runs" || cfg.test == "all");
    bool run_longest = (cfg.test == "longestrun" || cfg.test == "all");

    // Determine what to run
    bool do_seq = cfg.seq_only || cfg.benchmark || (!cfg.sycl_only);
    bool do_sycl = cfg.sycl_only || cfg.benchmark || (!cfg.seq_only);

    // If user specified both --sequential-only and --sycl-only, run both
    if (cfg.seq_only && cfg.sycl_only) {
        do_seq = true;
        do_sycl = true;
    }

    // Default behavior: if neither flag set and not benchmark, run both
    if (!cfg.seq_only && !cfg.sycl_only && !cfg.benchmark) {
        do_seq = true;
        do_sycl = true;
        cfg.benchmark = true;  // Show comparison by default
    }

    std::vector<TestResult> results;

    if (cfg.format == "csv") {
        print_csv_header();
    }

    // ---- Runs Test ----
    if (run_runs) {
        TestResult seq_result, sycl_result;

        if (do_seq) {
            seq_result = runs_test_sequential(data, n);
            results.push_back(seq_result);
            if (cfg.format == "csv") print_result_csv(seq_result);
            else print_result_text(seq_result);
        }

        if (do_sycl) {
            sycl_result = runs_test_sycl(data, n, cfg.wg_size, cfg.device);
            results.push_back(sycl_result);
            if (cfg.format == "csv") print_result_csv(sycl_result);
            else print_result_text(sycl_result);
        }

        if (cfg.benchmark && do_seq && do_sycl) {
            double speedup = seq_result.elapsed_ms / sycl_result.elapsed_ms;
            if (cfg.format != "csv") {
                std::cout << ">>> Runs Test Speedup: " << std::fixed
                          << std::setprecision(2) << speedup << "x"
                          << " (Sequential: " << std::setprecision(3)
                          << seq_result.elapsed_ms << " ms, SYCL: "
                          << sycl_result.elapsed_ms << " ms)\n";
                // Verify correctness
                if (!seq_result.prerequisite_failed && !sycl_result.prerequisite_failed) {
                    double p_diff = std::fabs(seq_result.p_value - sycl_result.p_value);
                    std::cout << ">>> P-value difference: " << std::scientific
                              << std::setprecision(2) << p_diff;
                    if (p_diff < 1e-6) {
                        std::cout << " (MATCH to 6 sig figs)\n";
                    } else {
                        std::cout << " (WARNING: mismatch)\n";
                    }
                    std::cout << std::fixed;
                }
                std::cout << "\n";
            }
        }
    }

    // ---- Longest Run of Ones Test ----
    if (run_longest) {
        TestResult seq_result, sycl_result;

        if (do_seq) {
            seq_result = longest_run_test_sequential(data, n);
            results.push_back(seq_result);
            if (cfg.format == "csv") print_result_csv(seq_result);
            else print_result_text(seq_result);
        }

        if (do_sycl) {
            sycl_result = longest_run_test_sycl(data, n, cfg.wg_size, cfg.device);
            results.push_back(sycl_result);
            if (cfg.format == "csv") print_result_csv(sycl_result);
            else print_result_text(sycl_result);
        }

        if (cfg.benchmark && do_seq && do_sycl) {
            double speedup = seq_result.elapsed_ms / sycl_result.elapsed_ms;
            if (cfg.format != "csv") {
                std::cout << ">>> Longest Run Test Speedup: " << std::fixed
                          << std::setprecision(2) << speedup << "x"
                          << " (Sequential: " << std::setprecision(3)
                          << seq_result.elapsed_ms << " ms, SYCL: "
                          << sycl_result.elapsed_ms << " ms)\n";
                if (!seq_result.prerequisite_failed && !sycl_result.prerequisite_failed) {
                    double p_diff = std::fabs(seq_result.p_value - sycl_result.p_value);
                    std::cout << ">>> P-value difference: " << std::scientific
                              << std::setprecision(2) << p_diff;
                    if (p_diff < 1e-6) {
                        std::cout << " (MATCH to 6 sig figs)\n";
                    } else {
                        std::cout << " (WARNING: mismatch)\n";
                    }
                    std::cout << std::fixed;
                }
                std::cout << "\n";
            }
        }
    }

    return 0;
}
