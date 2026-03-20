# CMakeLists.txt for NIST SP 800-22 SYCL Parallel Randomness Test Suite
#
# Build instructions:
#
# Option A: Using Intel oneAPI DPC++ compiler (recommended)
#   source /opt/intel/oneapi/setvars.sh
#   mkdir build && cd build
#   cmake -DCMAKE_CXX_COMPILER=icpx ..
#   make -j$(nproc)
#
# Option B: Using CMake with SYCL flags manually
#   mkdir build && cd build
#   cmake -DCMAKE_CXX_COMPILER=icpx -DCMAKE_CXX_FLAGS="-fsycl" ..
#   make -j$(nproc)
#

cmake_minimum_required(VERSION 3.16)
project(nist_sycl LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# SYCL compilation flags for Intel DPC++
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsycl -O2")

# For NVIDIA GPU backend (optional, uncomment if targeting NVIDIA):
# set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsycl -fsycl-targets=nvptx64-nvidia-cuda")

# For AMD GPU backend (optional, uncomment if targeting AMD):
# set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fsycl -fsycl-targets=amdgcn-amd-amdhsa")

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)

# Source files
set(SOURCES
    src/main.cpp
    src/sequential.cpp
    src/sycl_parallel.cpp
    src/math_utils.cpp
    src/io_utils.cpp
)

# Main executable
add_executable(nist_sycl ${SOURCES})
target_link_libraries(nist_sycl m)

# Test executable (for validation)
add_executable(nist_sycl_test
    src/test_validation.cpp
    src/sequential.cpp
    src/sycl_parallel.cpp
    src/math_utils.cpp
    src/io_utils.cpp
)
target_link_libraries(nist_sycl_test m)

# Sequential-only build (no SYCL dependency, for testing)
# Compile with: g++ -std=c++17 -O2 -o nist_seq src/main_seq.cpp src/sequential.cpp src/math_utils.cpp src/io_utils.cpp -Iinclude -lm
