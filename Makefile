# Makefile for NIST SP 800-22 SYCL Parallel Randomness Test Suite
#
# Prerequisites:
#   - Intel oneAPI Base Toolkit (provides icpx with -fsycl support)
#   - source /opt/intel/oneapi/setvars.sh   (set up environment)
#
# Usage:
#   make              Build everything (SYCL version)
#   make sequential   Build sequential-only version (no SYCL dependency)
#   make test         Build and run validation tests
#   make benchmark    Build and run performance benchmark
#   make clean        Clean build artifacts

# ---- Compiler settings ----
# For SYCL builds, use icpx from Intel oneAPI
CXX_SYCL   = icpx
CXXFLAGS    = -std=c++17 -O2 -Wall -Wextra
SYCLFLAGS   = -fsycl
INCLUDES    = -Iinclude
LDFLAGS     = -lm

# For sequential-only builds, any C++17 compiler works
CXX_SEQ     = g++

# Optional: target NVIDIA GPUs (uncomment to enable)
# SYCLFLAGS += -fsycl-targets=nvptx64-nvidia-cuda
# Optional: target AMD GPUs (uncomment to enable)
# SYCLFLAGS += -fsycl-targets=amdgcn-amd-amdhsa -Xsycl-target-backend --offload-arch=gfx90a

# ---- Source files ----
SRCDIR      = src
INCDIR      = include
BUILDDIR    = build

COMMON_SRC  = $(SRCDIR)/math_utils.cpp $(SRCDIR)/io_utils.cpp $(SRCDIR)/sequential.cpp
SYCL_SRC    = $(SRCDIR)/sycl_parallel.cpp
MAIN_SRC    = $(SRCDIR)/main.cpp
TEST_SRC    = $(SRCDIR)/test_validation.cpp

# ---- Targets ----
.PHONY: all sequential test benchmark clean help

all: $(BUILDDIR)/nist_sycl $(BUILDDIR)/nist_sycl_test

# Full SYCL build
$(BUILDDIR)/nist_sycl: $(MAIN_SRC) $(COMMON_SRC) $(SYCL_SRC) | $(BUILDDIR)
	$(CXX_SYCL) $(CXXFLAGS) $(SYCLFLAGS) $(INCLUDES) -o $@ $^ $(LDFLAGS)
	@echo "Built: $@"

# Validation test binary
$(BUILDDIR)/nist_sycl_test: $(TEST_SRC) $(COMMON_SRC) $(SYCL_SRC) | $(BUILDDIR)
	$(CXX_SYCL) $(CXXFLAGS) $(SYCLFLAGS) $(INCLUDES) -o $@ $^ $(LDFLAGS)
	@echo "Built: $@"

# Sequential-only build (no SYCL dependency, uses stub)
sequential: $(BUILDDIR)/nist_seq
$(BUILDDIR)/nist_seq: $(SRCDIR)/main_seq.cpp $(COMMON_SRC) | $(BUILDDIR)
	$(CXX_SEQ) $(CXXFLAGS) $(INCLUDES) -o $@ $^ $(LDFLAGS)
	@echo "Built: $@ (sequential only, no SYCL)"

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

# Run validation tests
test: $(BUILDDIR)/nist_sycl_test
	@echo "Running validation tests..."
	$(BUILDDIR)/nist_sycl_test

# Run performance benchmark
benchmark: $(BUILDDIR)/nist_sycl
	@echo "=== Benchmark: 100K bits ==="
	$(BUILDDIR)/nist_sycl --generate 100000 --benchmark
	@echo ""
	@echo "=== Benchmark: 1M bits ==="
	$(BUILDDIR)/nist_sycl --generate 1000000 --benchmark
	@echo ""
	@echo "=== Benchmark: 10M bits ==="
	$(BUILDDIR)/nist_sycl --generate 10000000 --benchmark
	@echo ""
	@echo "=== Benchmark: 100M bits ==="
	$(BUILDDIR)/nist_sycl --generate 100000000 --benchmark

clean:
	rm -rf $(BUILDDIR)

help:
	@echo "NIST SP 800-22 SYCL Parallel Test Suite - Build Targets"
	@echo "======================================================="
	@echo "  make              Build all (requires Intel oneAPI / icpx)"
	@echo "  make sequential   Build sequential-only (g++, no SYCL)"
	@echo "  make test         Run validation against NIST test vectors"
	@echo "  make benchmark    Run performance benchmarks"
	@echo "  make clean        Remove build artifacts"
