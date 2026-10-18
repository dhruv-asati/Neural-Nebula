package com.neuralnebula.dsa;

import com.neuralnebula.domain.PrerequisiteDependency;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Deterministic Kahn topological sort for directed prerequisite edges. */
public final class LearningOrderService {
    public record Result(String algorithm, boolean possible, List<String> learningOrder,
                         List<String> blockedNoteIds, int prerequisiteCount) { }

    /**
     * Returns all note IDs in prerequisite-first order, breaking ties by ID ascending.
     * The ready-note choice is intentionally implemented directly rather than delegated to
     * a graph library. Complexity is O(V^2 + E), with O(V + E) auxiliary storage.
     */
    public Result compute(Collection<String> noteIds, Collection<PrerequisiteDependency> prerequisites) {
        Set<String> notes = new HashSet<>(noteIds);
        if (notes.size() != noteIds.size()) throw new IllegalArgumentException("note IDs must be unique");
        Map<String, Integer> indegree = new HashMap<>();
        Map<String, List<String>> outgoing = new HashMap<>();
        notes.forEach(id -> { indegree.put(id, 0); outgoing.put(id, new ArrayList<>()); });
        for (PrerequisiteDependency dependency : prerequisites) {
            String prerequisite = dependency.prerequisiteNoteId();
            String dependent = dependency.dependentNoteId();
            if (!notes.contains(prerequisite) || !notes.contains(dependent)) {
                throw new IllegalArgumentException("Prerequisite references a note that does not exist");
            }
            outgoing.get(prerequisite).add(dependent);
            indegree.compute(dependent, (ignored, degree) -> degree + 1);
        }

        List<String> remaining = new ArrayList<>(notes);
        List<String> order = new ArrayList<>(notes.size());
        while (true) {
            String next = remaining.stream().filter(id -> indegree.get(id) == 0).min(String::compareTo).orElse(null);
            if (next == null) break;
            remaining.remove(next);
            order.add(next);
            for (String dependent : outgoing.get(next)) indegree.compute(dependent, (ignored, degree) -> degree - 1);
        }
        List<String> blocked = remaining.stream().sorted().toList();
        return new Result("Kahn Topological Sort", blocked.isEmpty(), List.copyOf(order), blocked, prerequisites.size());
    }
}
