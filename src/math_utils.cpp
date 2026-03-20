/**
 * math_utils.cpp - Special mathematical functions for NIST SP 800-22
 *
 * Implements the upper incomplete gamma function igamc(a, x)
 * needed for the Longest Run of Ones test p-value computation.
 *
 * Reference: NIST SP 800-22 Section 5.5.3
 * Algorithm: Numerical Recipes / Cephes library approach
 */

#include "nist_tests.h"
#include <cmath>
#include <limits>
#include <stdexcept>

// Machine epsilon and limits
static constexpr double MACHEP = 1.11022302462515654042e-16;
static constexpr double MAXLOG = 7.09782712893383996843e2;
static constexpr double BIG = 4.503599627370496e15;
static constexpr double BIGINV = 2.22044604925031308085e-16;

/**
 * Natural logarithm of the gamma function.
 * Uses the Lanczos approximation.
 */
static double lgam(double x) {
    return std::lgamma(x);
}

/**
 * Regularized lower incomplete gamma function P(a, x)
 * Computed using the series expansion for x < a+1.
 */
static double igam_series(double a, double x) {
    if (x == 0.0) return 0.0;

    double ax = a * std::log(x) - x - lgam(a);
    if (ax < -MAXLOG) return 0.0;
    ax = std::exp(ax);

    double sum = 1.0 / a;
    double term = sum;
    double ap = a;

    for (int n = 1; n < 300; n++) {
        ap += 1.0;
        term *= x / ap;
        sum += term;
        if (std::fabs(term) < std::fabs(sum) * MACHEP) {
            return sum * ax;
        }
    }
    return sum * ax;
}

/**
 * Upper incomplete gamma function Q(a, x) = igamc(a, x)
 * Computed using the continued fraction expansion for x >= a+1,
 * or as 1 - P(a,x) for x < a+1.
 *
 * This is the function used in NIST SP 800-22:
 *   P-value = igamc(K/2, chi2/2)
 */
double igamc(double a, double x) {
    if (x <= 0.0 || a <= 0.0) return 1.0;
    if (x < 1.0 || x < a) return 1.0 - igam_series(a, x);

    double ax = a * std::log(x) - x - lgam(a);
    if (ax < -MAXLOG) return 0.0;
    ax = std::exp(ax);

    // Continued fraction (Lentz's method)
    double y = 1.0 - a;
    double z = x + y + 1.0;
    double c = 0.0;
    double pkm2 = 1.0;
    double qkm2 = x;
    double pkm1 = x + 1.0;
    double qkm1 = z * x;
    double ans = pkm1 / qkm1;

    for (int n = 0; n < 300; n++) {
        c += 1.0;
        y += 1.0;
        z += 2.0;
        double yc = y * c;
        double pk = pkm1 * z - pkm2 * yc;
        double qk = qkm1 * z - qkm2 * yc;

        if (qk != 0.0) {
            double r = pk / qk;
            double t = std::fabs((ans - r) / r);
            ans = r;
            if (t < MACHEP) {
                return ans * ax;
            }
        } else {
            // t = 1.0; will continue
        }

        pkm2 = pkm1;
        pkm1 = pk;
        qkm2 = qkm1;
        qkm1 = qk;

        if (std::fabs(pk) > BIG) {
            pkm2 *= BIGINV;
            pkm1 *= BIGINV;
            qkm2 *= BIGINV;
            qkm1 *= BIGINV;
        }
    }
    return ans * ax;
}
