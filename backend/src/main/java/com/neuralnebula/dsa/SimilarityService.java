package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

/** Jaccard similarity and index-driven relationship candidate ranking. */
public final class SimilarityService {
    public enum Confidence { LOW, MEDIUM, HIGH }

    public record Suggestion(String noteId, double similarity, String reason) {
        public Suggestion(String noteId, double similarity) { this(noteId, similarity, null); }
    }

    public record NoteMatch(String noteId, double similarity, Confidence confidence, String reason) { }

    private static final double TITLE_WEIGHT = 0.42;
    private static final double CONTENT_WEIGHT = 0.36;
    private static final double TAG_WEIGHT = 0.22;
    private static final KeywordNormalizer NORMALIZER = new KeywordNormalizer();

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

    /**
     * Ranks only notes that share an indexed term. Title, content and tags each
     * contribute to a weighted Jaccard score, while a separate overlap gate
     * prevents a single broad tag from becoming a confident connection.
     */
    public List<NoteMatch> compare(Note source, KeywordIndex index, Function<String, Note> noteById) {
        Objects.requireNonNull(source);
        Objects.requireNonNull(index);
        Objects.requireNonNull(noteById);
        Set<String> sourceTerms = NORMALIZER.normalize(source);
        if (sourceTerms.isEmpty()) return List.of();
        Set<String> sourceTitle = NORMALIZER.normalize(source.title());
        Set<String> sourceContent = NORMALIZER.normalize(source.content());
        Set<String> sourceTags = normalizeTags(source);

        List<NoteMatch> matches = new ArrayList<>();
        for (String candidateId : index.candidatesFor(sourceTerms)) {
            if (candidateId.equals(source.id())) continue;
            Note candidate = noteById.apply(candidateId);
            if (candidate == null) continue;

            Set<String> candidateTitle = NORMALIZER.normalize(candidate.title());
            Set<String> candidateContent = NORMALIZER.normalize(candidate.content());
            Set<String> candidateTags = normalizeTags(candidate);

            double weightedScore = 0;
            double activeWeight = 0;
            if (!sourceTitle.isEmpty() || !candidateTitle.isEmpty()) {
                weightedScore += TITLE_WEIGHT * jaccard(sourceTitle, candidateTitle);
                activeWeight += TITLE_WEIGHT;
            }
            if (!sourceContent.isEmpty() || !candidateContent.isEmpty()) {
                weightedScore += CONTENT_WEIGHT * jaccard(sourceContent, candidateContent);
                activeWeight += CONTENT_WEIGHT;
            }
            if (!sourceTags.isEmpty() || !candidateTags.isEmpty()) {
                weightedScore += TAG_WEIGHT * jaccard(sourceTags, candidateTags);
                activeWeight += TAG_WEIGHT;
            }
            if (activeWeight == 0) continue;

            int titleOverlap = overlapCount(sourceTitle, candidateTitle);
            int contentOverlap = overlapCount(sourceContent, candidateContent);
            int titleContentOverlap = overlapCount(union(sourceTitle, sourceContent), union(candidateTitle, candidateContent));
            int tagOverlap = overlapCount(sourceTags, candidateTags);
            double tagSimilarity = jaccard(sourceTags, candidateTags);
            double score = weightedScore / activeWeight;
            // Several overlapping tags are useful for a human suggestion, but
            // are deliberately capped below the automatic-link threshold.
            if (titleContentOverlap == 0 && tagOverlap >= 2) {
                score = Math.max(score, Math.min(0.59, tagSimilarity * 0.62));
            }
            boolean semanticOverlap = titleContentOverlap >= 2
                    || (titleOverlap >= 1 && contentOverlap >= 1 && tagOverlap >= 1);
            Confidence confidence = score >= 0.62 && semanticOverlap
                    ? Confidence.HIGH
                    : score >= 0.28 && (titleContentOverlap >= 1 || (tagOverlap >= 2 && score >= 0.5))
                    ? Confidence.MEDIUM : Confidence.LOW;
            if (confidence == Confidence.LOW) continue;

            matches.add(new NoteMatch(candidateId, score, confidence,
                    explain(sourceTitle, candidateTitle, sourceContent, candidateContent, sourceTags, candidateTags)));
        }
        matches.sort(Comparator.comparingDouble(NoteMatch::similarity).reversed().thenComparing(NoteMatch::noteId));
        return List.copyOf(matches);
    }

    private static Set<String> normalizeTags(Note note) {
        Set<String> terms = new HashSet<>();
        for (String tag : note.tags()) terms.addAll(NORMALIZER.normalize(tag));
        return terms;
    }

    private static Set<String> union(Set<String> first, Set<String> second) {
        Set<String> result = new HashSet<>(first);
        result.addAll(second);
        return result;
    }

    private static int overlapCount(Set<String> first, Set<String> second) {
        Set<String> intersection = new HashSet<>(first);
        intersection.retainAll(second);
        return intersection.size();
    }

    private static String explain(Set<String> firstTitle, Set<String> secondTitle,
                                  Set<String> firstContent, Set<String> secondContent,
                                  Set<String> firstTags, Set<String> secondTags) {
        Set<String> titleContent = union(firstTitle, firstContent);
        titleContent.retainAll(union(secondTitle, secondContent));
        Set<String> sharedTags = new HashSet<>(firstTags);
        sharedTags.retainAll(secondTags);
        List<String> reasons = new ArrayList<>(2);
        if (!titleContent.isEmpty()) reasons.add("Shared terms: " + sample(titleContent));
        if (!sharedTags.isEmpty()) reasons.add("Shared tags: " + sample(sharedTags));
        return String.join(" · ", reasons);
    }

    private static String sample(Set<String> terms) {
        return terms.stream().sorted().limit(3).collect(java.util.stream.Collectors.joining(", "));
    }
}
