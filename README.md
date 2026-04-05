# NIST SP 800-22 SYCL Parallel Randomness Test Suite

**SYCL-based Parallel Implementation of Runs Test and Longest Run of Ones Test for Randomness Assessment**

**Website:** https://deesampan.github.io/NIST-SYCL-Fastest-Randomness-Checking/ | **Live Test:** https://deesampan.github.io/NIST-SYCL-Fastest-Randomness-Checking/test.html

## Overview

This project implements two statistical tests from the NIST SP 800-22 test suite for evaluating the quality of random and pseudorandom number generators:

1. **Runs Test** (Section 2.3) — Tests whether the number of runs (consecutive identical bits) is consistent with a truly random sequence.
2. **Longest Run of Ones in a Block Test** (Section 2.4) — Tests whether the longest run of ones within fixed-size blocks matches the expected distribution.

Both tests are implemented as:
- **Sequential C++17 baseline** — Correct reference implementation, compilable with any standard C++ compiler.
- **SYCL/DPC++ parallel implementation** — Accelerated using Intel oneAPI SYCL, targeting both CPU and GPU devices.

## Project Structure

```
nist_sycl/
├── CMakeLists.txt              # CMake build configuration
├── Makefile                    # Alternative Makefile build
├── README.md                   # This file
├── include/
│   └── nist_tests.h            # Common header: data structures, constants, interfaces
├── src/
│   ├── main.cpp                # CLI driver (full SYCL build)
│   ├── main_seq.cpp            # CLI driver (sequential-only, no SYCL)
│   ├── sequential.cpp          # Sequential implementations of both tests
│   ├── sycl_parallel.cpp       # SYCL parallel implementations of both tests
│   ├── math_utils.cpp          # igamc() and special math functions
│   ├── io_utils.cpp            # File I/O, output formatting
│   └── test_validation.cpp     # Validation against NIST reference test vectors
└── data/
    ├── nist_runs_test_vector.txt         # NIST Section 2.3.8 reference input
    └── nist_longest_run_test_vector.txt  # NIST Section 2.4.8 reference input
```

## Prerequisites

### For SYCL build (recommended)
- **Intel oneAPI Base Toolkit** (2024.1 or later)
  - Includes `icpx` compiler with `-fsycl` support
  - Download: https://www.intel.com/content/www/us/en/developer/tools/oneapi/base-toolkit-download.html
- Linux (Ubuntu 20.04+ recommended) or Windows with WSL2
- CMake 3.16+ (optional, Makefile also provided)

### For sequential-only build
- Any C++17 compiler: `g++ 8+`, `clang++ 10+`, or MSVC 2019+
- No GPU or SYCL runtime needed

## Build Instructions

### Option A: Using Makefile (recommended)

```bash
# 1. Set up Intel oneAPI environment
source /opt/intel/oneapi/setvars.sh

# 2. Build everything
make

# 3. Run validation tests
make test

# 4. Run benchmarks
make benchmark
```

### Option B: Using CMake

```bash
source /opt/intel/oneapi/setvars.sh
mkdir build && cd build
cmake -DCMAKE_CXX_COMPILER=icpx ..
make -j$(nproc)
```

### Option C: Sequential-only (no SYCL)

```bash
# Works with any C++17 compiler
make sequential

# Or manually:
g++ -std=c++17 -O2 -o nist_seq \
    src/main_seq.cpp src/sequential.cpp src/math_utils.cpp src/io_utils.cpp \
    -Iinclude -lm
```

### Targeting NVIDIA GPUs

Edit the `Makefile` or `CMakeLists.txt` to uncomment the NVIDIA backend line:
```
SYCLFLAGS += -fsycl-targets=nvptx64-nvidia-cuda
```

### Targeting AMD GPUs

```
SYCLFLAGS += -fsycl-targets=amdgcn-amd-amdhsa -Xsycl-target-backend --offload-arch=gfx90a
```

## Usage

### Basic usage

```bash
# Run both tests on a generated random sequence
./nist_sycl --generate 1000000 --benchmark

# Run on a file of ASCII '0'/'1' characters
./nist_sycl input.txt

# Run on a packed binary file
./nist_sycl --binary random.bin

# Select specific test
./nist_sycl --test runs --generate 1000000

# Select device
./nist_sycl --device gpu --generate 10000000 --benchmark

# CSV output for analysis
./nist_sycl --format csv --generate 10000000 --benchmark > results.csv

# Specify work-group size
./nist_sycl --workgroup 128 --generate 10000000 --benchmark
```

### Command-line options

| Option | Description | Default |
|--------|-------------|---------|
| `--device cpu\|gpu\|auto` | SYCL device selection | `auto` |
| `--test runs\|longestrun\|all` | Which test to run | `all` |
| `--length N` | Read only first N bits | all |
| `--workgroup W` | Work-group size (32,64,128,256,512) | `256` |
| `--format text\|csv` | Output format | `text` |
| `--binary` | Input is packed binary (not ASCII 0/1) | ASCII |
| `--generate N` | Generate random N-bit sequence | — |
| `--seed S` | RNG seed for `--generate` | `42` |
| `--sequential-only` | Run only sequential baseline | — |
| `--sycl-only` | Run only SYCL version | — |
| `--benchmark` | Run both and show speedup | — |

### Input file formats

1. **ASCII (default)**: A text file containing `0` and `1` characters. Whitespace and newlines are ignored.
   ```
   1100100100001111110110101010001000100001011010001100001000110100
   ```

2. **Packed binary** (`--binary`): A raw binary file where each byte contains 8 bits (MSB first). This is the standard format for large test sequences.

### Example output

```
Sequence length: 1000000 bits

========================================
Test:           Runs Test
Device:         CPU-Sequential
Sequence Len:   1000000 bits
Test Statistic: 500048.000000
P-value:        0.842735
Result:         PASS
Time:           3.456 ms
Throughput:     289.350 Mbits/s
========================================
========================================
Test:           Runs Test
Device:         SYCL-GPU (Intel(R) UHD Graphics 770)
Sequence Len:   1000000 bits
Test Statistic: 500048.000000
P-value:        0.842735
Result:         PASS
Time:           0.891 ms
Throughput:     1122.334 Mbits/s
========================================
>>> Runs Test Speedup: 3.88x (Sequential: 3.456 ms, SYCL: 0.891 ms)
>>> P-value difference: 0.00e+00 (MATCH to 6 sig figs)
```

## Validation

The implementation is validated against the official NIST SP 800-22 reference test vectors:

| Test | Section | n | Expected P-value | Status |
|------|---------|---|-------------------|--------|
| Runs Test | 2.3.8 | 100 | 0.500798 | ✓ |
| Runs Test (small) | 2.3.4 | 10 | 0.147232 | ✓ |
| Longest Run | 2.4.8 | 128 | 0.180609 | ✓ |

Run the full validation suite:
```bash
make test
# or
./build/nist_sycl_test
```

## Algorithm Details

### Runs Test (NIST SP 800-22 Section 2.3)

**Sequential**: O(n) scan counting transitions between consecutive bits.

**SYCL Parallel**: The sequence is divided into chunks of 1024 bits. Each work-item independently counts transitions within its chunk plus records boundary bits. A host-side O(W) merge pass adds boundary transitions. This achieves O(n/W) work per item.

### Longest Run of Ones (NIST SP 800-22 Section 2.4)

**Sequential**: O(n) scan through N blocks of M bits each.

**SYCL Parallel**: One work-group per M-bit block (embarrassingly parallel). Within each work-group, work-items split the M bits into segments, compute local longest runs plus prefix/suffix run lengths, then perform a tree reduction in local memory to find the block-global maximum while correctly merging runs that span segment boundaries.

### P-value Computation

- **Runs Test**: `P = erfc(|V_obs - 2nπ(1-π)| / (2√(2n)·π·(1-π)))` where π is the proportion of ones.
- **Longest Run**: `P = igamc(K/2, χ²/2)` where χ² is the chi-squared statistic from the frequency table.

## Performance Notes

- For small sequences (< 10K bits), the SYCL overhead (device selection, buffer allocation, kernel launch) may exceed the computation time. Sequential is faster for small inputs.
- Speedup becomes significant for sequences ≥ 1M bits.
- The Longest Run test benefits more from parallelism than the Runs test because it is embarrassingly parallel at the block level.
- Optimal work-group size depends on the device; experiment with `--workgroup` values.

## References

1. Rukhin, A. et al. NIST SP 800-22 Rev 1a: A Statistical Test Suite for Random and Pseudorandom Number Generators for Cryptographic Applications. NIST, 2010.
2. Data Parallel C++ (2nd Edition). Springer, 2023. https://link.springer.com/book/10.1007/978-1-4842-9691-2
3. The Khronos Group. SYCL 2020 Specification. https://registry.khronos.org/SYCL/
4. Intel oneAPI DPC++ Compiler. https://www.intel.com/content/www/us/en/developer/tools/oneapi/dpc-compiler.html

## License

This project is developed as a graduation design (thesis) at Xihua University. The NIST SP 800-22 algorithms are in the public domain.
