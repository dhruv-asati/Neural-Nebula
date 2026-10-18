package com.neuralnebula.dsa;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** BFS shortest path in the unweighted ordinary relationship graph; O(V + E). */
public final class ShortestPathService {
    public record Result(String algorithm, List<String> path, boolean pathExists,
                         int visitedNodeCount, int edgeChecks) { }

    public Result shortestPath(NoteGraph graph, String startId, String endId) {
        if (!graph.containsVertex(startId)) throw new IllegalArgumentException("start vertex does not exist: " + startId);
        if (!graph.containsVertex(endId)) throw new IllegalArgumentException("end vertex does not exist: " + endId);
        if (startId.equals(endId)) return new Result("BFS", List.of(startId), true, 1, 0);

        ArrayDeque<String> queue = new ArrayDeque<>();
        Set<String> visited = new HashSet<>();
        Map<String, String> parent = new HashMap<>();
        queue.add(startId);
        visited.add(startId);
        int edgeChecks = 0;
        while (!queue.isEmpty()) {
            String current = queue.remove();
            for (String neighbor : graph.neighborsOf(current).stream().sorted().toList()) {
                edgeChecks++;
                if (visited.add(neighbor)) {
                    parent.put(neighbor, current);
                    if (neighbor.equals(endId)) {
                        return new Result("BFS", reconstruct(parent, startId, endId), true, visited.size(), edgeChecks);
                    }
                    queue.add(neighbor);
                }
            }
        }
        return new Result("BFS", List.of(), false, visited.size(), edgeChecks);
    }

    private static List<String> reconstruct(Map<String, String> parent, String start, String end) {
        List<String> path = new ArrayList<>();
        for (String current = end; current != null; current = parent.get(current)) {
            path.add(current);
            if (current.equals(start)) break;
        }
        Collections.reverse(path);
        return List.copyOf(path);
    }
}
