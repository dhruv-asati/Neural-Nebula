package com.neuralnebula.dsa;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Deterministic weighted label propagation over ordinary graph links. Edge weights are keyword
 * Jaccard scores; empty-keyword and sub-threshold links carry no influence. At most 20 sweeps run.
 */
public final class CommunityDetectionService {
    private static final int MAX_SWEEPS = 20;
    public record Result(String algorithm, List<List<String>> communities, Map<String, String> communityByNoteId,
                         int sweeps, int consideredEdges, double minimumEdgeWeight) { }

    private final SimilarityService similarityService;
    private final double minimumEdgeWeight;

    public CommunityDetectionService() { this(0.10, new SimilarityService()); }

    public CommunityDetectionService(double minimumEdgeWeight, SimilarityService similarityService) {
        if (!Double.isFinite(minimumEdgeWeight) || minimumEdgeWeight < 0 || minimumEdgeWeight > 1) {
            throw new IllegalArgumentException("minimumEdgeWeight must be between 0 and 1");
        }
        this.minimumEdgeWeight = minimumEdgeWeight;
        this.similarityService = similarityService;
    }

    public Result detect(NoteGraph graph, KeywordIndex index) {
        List<String> vertices = graph.vertexIds();
        Map<String, String> labels = new HashMap<>();
        vertices.forEach(id -> labels.put(id, id));
        Map<String, Map<String, Double>> weights = new HashMap<>();
        int consideredEdges = 0;
        for (List<String> edge : graph.edges()) {
            String first = edge.get(0), second = edge.get(1);
            double score = similarityService.jaccard(index.termsForNote(first), index.termsForNote(second));
            // Unlike generic Jaccard, two empty keyword sets do not establish a topical relation.
            if (index.termsForNote(first).isEmpty() || index.termsForNote(second).isEmpty()) score = 0;
            if (score < minimumEdgeWeight) continue;
            weights.computeIfAbsent(first, ignored -> new TreeMap<>()).put(second, score);
            weights.computeIfAbsent(second, ignored -> new TreeMap<>()).put(first, score);
            consideredEdges++;
        }

        int sweeps = 0;
        for (; sweeps < MAX_SWEEPS; sweeps++) {
            boolean changed = false;
            for (String id : vertices) {
                Map<String, Double> communityScores = new TreeMap<>();
                for (var neighbor : weights.getOrDefault(id, Map.of()).entrySet()) {
                    String neighborLabel = labels.get(neighbor.getKey());
                    communityScores.merge(neighborLabel, neighbor.getValue(), Double::sum);
                }
                if (communityScores.isEmpty()) continue;
                String bestLabel = communityScores.entrySet().stream()
                        .max(Map.Entry.<String, Double>comparingByValue().thenComparing(entry -> entry.getKey(),
                                java.util.Comparator.reverseOrder()))
                        .orElseThrow().getKey();
                if (!bestLabel.equals(labels.get(id))) {
                    labels.put(id, bestLabel);
                    changed = true;
                }
            }
            if (!changed) { sweeps++; break; }
        }

        Map<String, List<String>> byLabel = new TreeMap<>();
        labels.forEach((id, label) -> byLabel.computeIfAbsent(label, ignored -> new ArrayList<>()).add(id));
        List<List<String>> communities = byLabel.values().stream().map(group -> group.stream().sorted().toList())
                .sorted(java.util.Comparator.comparing(group -> group.getFirst())).toList();
        Map<String, String> stableLabels = new TreeMap<>();
        for (List<String> community : communities) {
            String communityId = community.getFirst();
            community.forEach(id -> stableLabels.put(id, communityId));
        }
        return new Result("Weighted Label Propagation", communities, Collections.unmodifiableMap(stableLabels), sweeps,
                consideredEdges, minimumEdgeWeight);
    }
}
