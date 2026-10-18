package com.neuralnebula.dsa;

import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.List;

/**
 * Undirected simple graph stored as note ID -> neighboring note IDs.
 * Vertex insertion/existence is expected O(1); adding/removing an edge and neighbor lookup
 * are expected O(1) average; removing a vertex is O(degree); edge count is O(1).
 */
public final class NoteGraph {
    private final Map<String, Set<String>> adjacency = new HashMap<>();
    private int edgeCount;

    /** Adds an isolated vertex. Returns false if it already exists. */
    public boolean addVertex(String noteId) {
        return adjacency.putIfAbsent(requireId(noteId), new HashSet<>()) == null;
    }

    /** Removes a vertex and all incident undirected edges. Returns false if absent. */
    public boolean removeVertex(String noteId) {
        String id = requireId(noteId);
        Set<String> neighbors = adjacency.remove(id);
        if (neighbors == null) return false;
        for (String neighbor : neighbors) {
            adjacency.get(neighbor).remove(id);
            edgeCount--;
        }
        return true;
    }

    /** Adds an edge; duplicate edges and self-links are rejected. */
    public void addEdge(String firstId, String secondId) {
        String first = requireId(firstId);
        String second = requireId(secondId);
        if (first.equals(second)) throw new IllegalArgumentException("self-links are not allowed");
        Set<String> firstNeighbors = adjacency.get(first);
        Set<String> secondNeighbors = adjacency.get(second);
        if (firstNeighbors == null || secondNeighbors == null) {
            throw new IllegalArgumentException("both edge endpoints must already exist");
        }
        if (!firstNeighbors.add(second)) throw new IllegalArgumentException("edge already exists");
        secondNeighbors.add(first);
        edgeCount++;
    }

    /** Removes an existing edge or throws if either endpoint or the edge is missing. */
    public void removeEdge(String firstId, String secondId) {
        String first = requireId(firstId);
        String second = requireId(secondId);
        if (first.equals(second)) throw new IllegalArgumentException("self-links are not allowed");
        Set<String> firstNeighbors = adjacency.get(first);
        Set<String> secondNeighbors = adjacency.get(second);
        if (firstNeighbors == null || secondNeighbors == null) {
            throw new IllegalArgumentException("both edge endpoints must exist");
        }
        if (!firstNeighbors.remove(second)) throw new IllegalArgumentException("edge does not exist");
        secondNeighbors.remove(first);
        edgeCount--;
    }

    /** Returns an immutable snapshot, so callers cannot mutate graph state. */
    public Set<String> neighborsOf(String noteId) {
        Set<String> neighbors = adjacency.get(requireId(noteId));
        if (neighbors == null) throw new IllegalArgumentException("vertex does not exist: " + noteId);
        return Collections.unmodifiableSet(new HashSet<>(neighbors));
    }

    public boolean containsVertex(String noteId) {
        return adjacency.containsKey(requireId(noteId));
    }

    public int vertexCount() { return adjacency.size(); }
    public int edgeCount() { return edgeCount; }

    /** Deterministic immutable snapshot of all vertex IDs. O(V log V). */
    public List<String> vertexIds() { return adjacency.keySet().stream().sorted().toList(); }

    /** Each undirected edge appears once, with endpoints in lexical order. O(V + E) plus sorting. */
    public List<List<String>> edges() {
        List<List<String>> result = new java.util.ArrayList<>();
        for (String first : vertexIds()) {
            for (String second : new TreeSet<>(adjacency.get(first))) {
                if (first.compareTo(second) < 0) result.add(List.of(first, second));
            }
        }
        return List.copyOf(result);
    }

    private static String requireId(String id) {
        Objects.requireNonNull(id, "note ID cannot be null");
        if (id.isBlank()) throw new IllegalArgumentException("note ID cannot be blank");
        return id;
    }
}
