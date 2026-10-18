package com.neuralnebula.dsa;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class NoteGraphTest {
    @Test
    void tracksUndirectedEdgesAndCounts() {
        NoteGraph graph = new NoteGraph();
        assertTrue(graph.addVertex("a"));
        graph.addVertex("b");
        graph.addEdge("a", "b");
        assertEquals(2, graph.vertexCount());
        assertEquals(1, graph.edgeCount());
        assertEquals(java.util.Set.of("b"), graph.neighborsOf("a"));
        assertEquals(java.util.Set.of("a"), graph.neighborsOf("b"));
        graph.removeEdge("b", "a");
        assertEquals(0, graph.edgeCount());
    }

    @Test
    void rejectsDuplicateSelfAndMissingEdgesAndProtectsNeighbors() {
        NoteGraph graph = new NoteGraph();
        graph.addVertex("a");
        graph.addVertex("b");
        graph.addEdge("a", "b");
        assertThrows(IllegalArgumentException.class, () -> graph.addEdge("b", "a"));
        assertThrows(IllegalArgumentException.class, () -> graph.addEdge("a", "a"));
        assertThrows(IllegalArgumentException.class, () -> graph.addEdge("a", "missing"));
        assertThrows(UnsupportedOperationException.class, () -> graph.neighborsOf("a").clear());
        assertEquals(java.util.Set.of("b"), graph.neighborsOf("a"));
        assertThrows(IllegalArgumentException.class, () -> graph.neighborsOf("missing"));
    }

    @Test
    void removingVertexRemovesAllIncidentEdges() {
        NoteGraph graph = new NoteGraph();
        graph.addVertex("a"); graph.addVertex("b"); graph.addVertex("c");
        graph.addEdge("a", "b"); graph.addEdge("a", "c");
        assertTrue(graph.removeVertex("a"));
        assertEquals(2, graph.vertexCount());
        assertEquals(0, graph.edgeCount());
        assertTrue(graph.neighborsOf("b").isEmpty());
        assertFalse(graph.removeVertex("a"));
    }
}
