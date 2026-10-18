package com.neuralnebula.dsa;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

/** Jaccard similarity and index-driven relationship candidate ranking. */
public final class SimilarityService {
    public record Suggestion(String noteId, double similarity) { }

    /** Two empty sets have similarity 1.0 (identical); exactly one empty set has 0.0. */
    public double jaccard(Set<String> first, Set<String> second) {
        Objects.requireNonNull(first);
        Objects.requireNonNull(second);
        if (first.isEmpty() && second.isEmpty()) return 1.0;
        Set<String> intersection = new HashSet<>(first);
        intersection.retainAll(second);
        Set<String> union = new HashSet<>(first);
        union.addAll(second);
        return (double) intersection.size() / union.size();
    }

    /** Candidate generation only examines notes sharing a term, avoiding all-pairs comparison. */
    public List<Suggestion> suggest(String noteId, KeywordIndex index, double threshold) {
        Objects.requireNonNull(index);
        if (threshold < 0 || threshold > 1 || !Double.isFinite(threshold)) {
            throw new IllegalArgumentException("threshold must be between 0 and 1");
        }
        Set<String> terms = index.termsForNote(noteId);
        if (terms.isEmpty()) return List.of();
        List<Suggestion> result = new ArrayList<>();
        for (String candidate : index.candidatesFor(terms)) {
            if (candidate.equals(noteId)) continue;
            double score = jaccard(terms, index.termsForNote(candidate));
            if (score >= threshold) result.add(new Suggestion(candidate, score));
        }
        result.sort(java.util.Comparator.comparingDouble(Suggestion::similarity).reversed()
                .thenComparing(Suggestion::noteId));
        return List.copyOf(result);
    }
}
