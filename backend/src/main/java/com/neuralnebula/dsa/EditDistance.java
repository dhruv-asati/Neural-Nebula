package com.neuralnebula.dsa;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;

/** Levenshtein distance using two rolling rows: O(m*n) time and O(min(m,n)) memory. */
public final class EditDistance {
    public record Correction(String term, int distance) { }

    public int distance(String first, String second) {
        Objects.requireNonNull(first); Objects.requireNonNull(second);
        if (first.length() < second.length()) return calculate(first, second);
        return calculate(second, first);
    }

    /** Returns only terms within maxDistance; ties are ordered lexicographically. */
    public List<Correction> corrections(String query, Iterable<String> knownTerms, int maxDistance) {
        Objects.requireNonNull(query); Objects.requireNonNull(knownTerms);
        if (maxDistance < 0) throw new IllegalArgumentException("maxDistance cannot be negative");
        List<Correction> corrections = new ArrayList<>();
        for (String term : knownTerms) {
            int distance = distance(query, term, maxDistance);
            if (distance <= maxDistance) corrections.add(new Correction(term, distance));
        }
        corrections.sort(Comparator.comparingInt(Correction::distance).thenComparing(Correction::term));
        return List.copyOf(corrections);
    }

    /** Corrects one normalized query token against the vocabulary maintained by the keyword index. */
    public List<Correction> suggestCorrections(String query, KeywordIndex index, int maxDistance) {
        Objects.requireNonNull(index);
        var normalized = new KeywordNormalizer().normalize(query);
        if (normalized.size() != 1) return List.of();
        return corrections(normalized.iterator().next(), index.allTerms(), maxDistance);
    }

    /** Cutoff variant returns maxDistance+1 when the true distance exceeds the limit. */
    public int distance(String first, String second, int maxDistance) {
        Objects.requireNonNull(first); Objects.requireNonNull(second);
        if (maxDistance < 0) throw new IllegalArgumentException("maxDistance cannot be negative");
        if (Math.abs(first.length() - second.length()) > maxDistance) return maxDistance + 1;
        // The band limits work to potentially reachable cells while retaining the rolling-row DP.
        String a = first, b = second;
        if (a.length() > b.length()) { a = second; b = first; }
        int m = a.length(), n = b.length(), infinity = maxDistance + 1;
        int[] previous = new int[m + 1], current = new int[m + 1];
        for (int i = 0; i <= m; i++) previous[i] = i;
        for (int j = 1; j <= n; j++) {
            java.util.Arrays.fill(current, infinity);
            current[0] = j;
            int start = Math.max(1, j - maxDistance), end = Math.min(m, j + maxDistance);
            for (int i = start; i <= end; i++) {
                int substitution = previous[i - 1] + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1);
                current[i] = Math.min(Math.min(previous[i] + 1, current[i - 1] + 1), substitution);
            }
            int[] swap = previous; previous = current; current = swap;
        }
        return previous[m];
    }

    private static int calculate(String shorter, String longer) {
        int[] previous = new int[shorter.length() + 1], current = new int[shorter.length() + 1];
        for (int i = 0; i <= shorter.length(); i++) previous[i] = i;
        for (int row = 1; row <= longer.length(); row++) {
            current[0] = row;
            for (int col = 1; col <= shorter.length(); col++) {
                int substitution = previous[col - 1] + (shorter.charAt(col - 1) == longer.charAt(row - 1) ? 0 : 1);
                current[col] = Math.min(Math.min(previous[col] + 1, current[col - 1] + 1), substitution);
            }
            int[] swap = previous; previous = current; current = swap;
        }
        return previous[shorter.length()];
    }
}
