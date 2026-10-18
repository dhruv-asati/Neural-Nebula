package com.neuralnebula.dsa;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Deterministic depth-first traversal over the ordinary conceptual-link graph. */
public final class GraphTraversal {
    public record Result(String algorithm, List<String> visitedNoteIds, int visitedNodeCount, int edgeChecks) { }

    public Result depthFirst(NoteGraph graph, String startId) {
        if (!graph.containsVertex(startId)) throw new IllegalArgumentException("start vertex does not exist: " + startId);
        List<String> visitedOrder = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        ArrayDeque<String> stack = new ArrayDeque<>();
        stack.push(startId);
        int checks = 0;
        while (!stack.isEmpty()) {
            String current = stack.pop();
            if (!visited.add(current)) continue;
            visitedOrder.add(current);
            List<String> neighbors = graph.neighborsOf(current).stream().sorted().toList();
            checks += neighbors.size();
            // Reverse push order so the lexical-first neighbor is visited first.
            for (int i = neighbors.size() - 1; i >= 0; i--) {
                String neighbor = neighbors.get(i);
                if (!visited.contains(neighbor)) stack.push(neighbor);
            }
        }
        return new Result("DFS", List.copyOf(visitedOrder), visitedOrder.size(), checks);
    }
}
