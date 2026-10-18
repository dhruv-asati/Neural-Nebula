package com.neuralnebula.dsa;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

/** Rebuilds Union-Find per query so arbitrary graph edge deletions cannot leave stale components. */
public final class ConnectedComponentsService {
    public record Result(String algorithm, List<List<String>> components, int componentCount,
                         int unionOperations, int findOperations) { }

    public Result compute(NoteGraph graph) {
        UnionFind unionFind = new UnionFind(graph.vertexIds());
        int unions = 0;
        for (List<String> edge : graph.edges()) {
            unionFind.union(edge.get(0), edge.get(1));
            unions++;
        }
        Map<String, List<String>> groupsByRoot = new TreeMap<>();
        for (String id : graph.vertexIds()) groupsByRoot.computeIfAbsent(unionFind.find(id), ignored -> new ArrayList<>()).add(id);
        List<List<String>> groups = groupsByRoot.values().stream()
                .map(group -> group.stream().sorted().toList())
                .sorted(java.util.Comparator.comparing(group -> group.getFirst()))
                .toList();
        return new Result("Union-Find", groups, groups.size(), unions, unionFind.findOperationCount());
    }
}
