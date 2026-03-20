/**
 * generate_sequence.cpp - Generate random bit sequence and save to file
 *
 * Usage:
 *   generate_seq.exe <num_bits> <output_file> [seed]
 *
 * Example:
 *   generate_seq.exe 1000000 my_random.txt
 *   generate_seq.exe 1000000 my_random.txt 12345
 */

#include <iostream>
#include <fstream>
#include <random>
#include <cstdlib>
#include <string>

int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cout << "Usage: generate_seq.exe <num_bits> <output_file> [seed]\n";
        std::cout << "Example: generate_seq.exe 1000000 my_random.txt\n";
        return 1;
    }

    size_t n = std::stoull(argv[1]);
    std::string filename = argv[2];
    uint64_t seed = (argc >= 4) ? std::stoull(argv[3]) : 42;

    std::cout << "Generating " << n << " bits (seed=" << seed << ")...\n";

    std::mt19937_64 rng(seed);
    std::uniform_int_distribution<int> dist(0, 1);

    std::ofstream ofs(filename);
    if (!ofs.is_open()) {
        std::cerr << "Error: Cannot open " << filename << "\n";
        return 1;
    }

    for (size_t i = 0; i < n; i++) {
        ofs << dist(rng);
        // Newline every 80 chars for readability
        if ((i + 1) % 80 == 0) ofs << '\n';
    }
    ofs << '\n';
    ofs.close();

    std::cout << "Saved to: " << filename << "\n";
    std::cout << "File size: ~" << (n / 1024) << " KB\n";
    std::cout << "\nTo test it:\n";
    std::cout << "  nist_sycl.exe " << filename << " --benchmark\n";

    return 0;
}
