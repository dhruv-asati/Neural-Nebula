package com.neuralnebula.dsa;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class GraphAlgorithmsTest {
    private NoteGraph graph(String... ids) {
        NoteGraph graph = new NoteGraph();
        for (String id : ids) graph.addVertex(id);
        return graph;
    }

    @Test
    void dfsUsesDeterministicOrderAndOnlyTraversesStartComponent() {
        NoteGraph graph = graph("a", "b", "c", "isolated");
        graph.addEdge("a", "c"); graph.addEdge("a", "b"); graph.addEdge("b", "c");
        GraphTraversal.Result result = new GraphTraversal().depthFirst(graph, "a");
        assertEquals(List.of("a", "b", "c"), result.visitedNoteIds());
        assertEquals(3, result.visitedNodeCount());
        assertThrows(IllegalArgumentException.class, () -> new GraphTraversal().depthFirst(graph, "missing"));
    }

    @Test
    void bfsFindsShortestPathsAndReportsUnreachableAndSameNode() {
        NoteGraph graph = graph("a", "b", "c", "d", "isolated");
        graph.addEdge("a", "b"); graph.addEdge("b", "d"); graph.addEdge("a", "c"); graph.addEdge("c", "d");
        ShortestPathService service = new ShortestPathService();
        assertEquals(List.of("a", "b", "d"), service.shortestPath(graph, "a", "d").path());
        var same = service.shortestPath(graph, "a", "a");
        assertEquals(List.of("a"), same.path()); assertEquals(1, same.visitedNodeCount());
        var unreachable = service.shortestPath(graph, "a", "isolated");
        assertFalse(unreachable.pathExists()); assertTrue(unreachable.path().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> service.shortestPath(graph, "missing", "a"));
    }

    @Test
    void unionFindAndComponentsHandleIsolatesAndRebuildAfterDeletion() {
        UnionFind unionFind = new UnionFind(List.of("a", "b", "c"));
        assertTrue(unionFind.union("a", "b"));
        assertFalse(unionFind.union("b", "a"));
        assertEquals(unionFind.find("a"), unionFind.find("b"));
        assertEquals(2, unionFind.componentCount());

        NoteGraph graph = graph("a", "b", "c", "isolated");
        graph.addEdge("a", "b"); graph.addEdge("b", "c");
        ConnectedComponentsService service = new ConnectedComponentsService();
        assertEquals(List.of(List.of("a", "b", "c"), List.of("isolated")), service.compute(graph).components());
        graph.removeEdge("b", "c");
        assertEquals(List.of(List.of("a", "b"), List.of("c"), List.of("isolated")), service.compute(graph).components());
    }

    @Test
    void weightedLabelPropagationCanSplitOneConnectedGraphIntoTopicCommunities() {
        KeywordIndex index = new KeywordIndex(new KeywordNormalizer());
        index.index(note("a1", "red apple", ""));
        index.index(note("a2", "red apple", ""));
        index.index(note("a3", "red apple", ""));
        index.index(note("b1", "blue ocean", ""));
        index.index(note("b2", "blue ocean", ""));
        index.index(note("b3", "blue ocean", ""));
        NoteGraph graph = graph("a1", "a2", "a3", "b1", "b2", "b3", "isolated");
        graph.addEdge("a1", "a2"); graph.addEdge("a2", "a3"); graph.addEdge("a1", "a3");
        graph.addEdge("b1", "b2"); graph.addEdge("b2", "b3"); graph.addEdge("b1", "b3");
        graph.addEdge("a3", "b1"); // The ordinary graph stays connected; this topical bridge has weight 0.
        var result = new CommunityDetectionService().detect(graph, index);
        assertEquals(List.of(List.of("a1", "a2", "a3"), List.of("b1", "b2", "b3"), List.of("isolated")), result.communities());
        assertEquals(7, result.communityByNoteId().size());
    }

    private static com.neuralnebula.domain.Note note(String id, String title, String content) {
        return new com.neuralnebula.domain.Note(id, title, content, Set.of(),
                com.neuralnebula.domain.NoteType.CONCEPT, 50, java.time.Instant.EPOCH, java.time.Instant.EPOCH);
    }
}
