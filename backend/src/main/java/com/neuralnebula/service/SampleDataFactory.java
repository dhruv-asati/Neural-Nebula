package com.neuralnebula.service;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteRelationship;
import com.neuralnebula.domain.NoteType;
import com.neuralnebula.domain.RelationshipOrigin;
import com.neuralnebula.domain.RelationshipType;
import com.neuralnebula.persistence.PersistedData;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Reproducible 20-note seed dataset with three clusters, bridges, and one isolated concept. */
public final class SampleDataFactory {
    private static final Instant CREATED = Instant.parse("2026-01-15T12:00:00Z");

    public PersistedData create() {
        List<Note> notes = List.of(
                note("dsa-structures", "Data Structures", "Ways to organize data for efficient operations.", NoteType.CONCEPT, 90, "dsa", "algorithms", "graph", "search"),
                note("algorithm-analysis", "Algorithm Analysis", "Analyze time and space cost using asymptotic notation.", NoteType.SUMMARY, 86, "dsa", "complexity", "algorithms", "graph", "search"),
                note("graph-theory", "Graph Theory", "Graphs model vertices connected by edges and support traversal and path problems.", NoteType.CONCEPT, 95, "graphs", "dsa", "algorithms", "search"),
                note("breadth-first-search", "Breadth-First Search", "BFS explores a graph level by level and finds shortest paths in unweighted graphs.", NoteType.CONCEPT, 92, "graphs", "search", "dsa", "algorithms"),
                note("depth-first-search", "Depth-First Search", "DFS explores one branch deeply before backtracking.", NoteType.CONCEPT, 83, "graphs", "search", "dsa", "algorithms"),
                note("union-find", "Union-Find", "Disjoint sets support connectivity queries with path compression and union by rank.", NoteType.CONCEPT, 81, "graphs", "dsa", "algorithms", "search"),
                note("jaccard-index", "Jaccard Similarity", "Set similarity is intersection size divided by union size.", NoteType.CONCEPT, 76, "similarity", "search", "dsa", "algorithms", "graph"),
                note("machine-learning", "Machine Learning", "Models learn useful patterns from examples and data.", NoteType.CONCEPT, 94, "ml", "learning", "neural", "model"),
                note("supervised-learning", "Supervised Learning", "Learn a mapping from labeled examples to predictions.", NoteType.CONCEPT, 87, "ml", "training", "neural", "model", "learning"),
                note("neural-networks", "Neural Networks", "Layered differentiable functions learn representations from data.", NoteType.CONCEPT, 96, "ml", "networks", "learning", "neural", "model"),
                note("perceptron", "Perceptron", "A linear threshold unit combines weighted inputs and an activation rule.", NoteType.SUMMARY, 73, "ml", "networks", "learning", "neural", "model"),
                note("backpropagation", "Backpropagation", "Compute gradients through a network using the chain rule.", NoteType.CONCEPT, 89, "ml", "optimization", "learning", "neural", "model"),
                note("embeddings", "Embeddings", "Dense vectors represent items so useful similarities can be computed.", NoteType.RESOURCE, 78, "ml", "similarity", "learning", "neural", "model"),
                note("operating-systems", "Operating Systems", "An operating system manages processes, memory, devices, and files.", NoteType.CONCEPT, 91, "systems", "os", "process", "memory", "thread", "scheduling"),
                note("processes", "Processes", "A process is a running program with its own execution state and resources.", NoteType.CONCEPT, 86, "systems", "os", "process", "memory", "thread", "scheduling"),
                note("threads", "Threads", "Threads share a process address space while executing independent instruction streams.", NoteType.CONCEPT, 82, "systems", "os", "concurrency", "process", "memory", "thread", "scheduling"),
                note("cpu-scheduling", "CPU Scheduling", "Scheduling policies choose which ready task receives processor time.", NoteType.CONCEPT, 79, "systems", "os", "process", "memory", "thread", "scheduling"),
                note("memory-management", "Memory Management", "Virtual memory maps process addresses to physical memory and storage.", NoteType.CONCEPT, 85, "systems", "os", "process", "memory", "thread", "scheduling"),
                note("software-design", "Software Design", "Good design separates responsibilities and makes change easier to reason about.", NoteType.SUMMARY, 88, "engineering", "design"),
                note("research-question", "Open Research Question", "An isolated placeholder for a future idea not yet connected to the knowledge graph.", NoteType.QUESTION, 42, "research")
        );

        List<NoteRelationship> links = new ArrayList<>();
        link(links, "structures-analysis", "dsa-structures", "algorithm-analysis");
        link(links, "structures-graphs", "dsa-structures", "graph-theory");
        link(links, "graphs-bfs", "graph-theory", "breadth-first-search");
        link(links, "graphs-dfs", "graph-theory", "depth-first-search");
        link(links, "graphs-union-find", "graph-theory", "union-find");
        link(links, "search-jaccard", "breadth-first-search", "jaccard-index");
        link(links, "ml-supervised", "machine-learning", "supervised-learning");
        link(links, "ml-networks", "machine-learning", "neural-networks");
        link(links, "networks-perceptron", "neural-networks", "perceptron");
        link(links, "networks-backprop", "neural-networks", "backpropagation");
        link(links, "networks-embeddings", "neural-networks", "embeddings");
        link(links, "systems-processes", "operating-systems", "processes");
        link(links, "systems-threads", "operating-systems", "threads");
        link(links, "systems-scheduling", "operating-systems", "cpu-scheduling");
        link(links, "systems-memory", "operating-systems", "memory-management");
        link(links, "threads-processes", "threads", "processes");
        link(links, "bridge-search-ml", "jaccard-index", "embeddings");
        link(links, "bridge-graphs-ml", "graph-theory", "neural-networks");
        link(links, "bridge-ml-systems", "machine-learning", "operating-systems");
        link(links, "bridge-design-systems", "software-design", "operating-systems");
        return new PersistedData(PersistedData.CURRENT_SCHEMA_VERSION, notes, links, List.of());
    }

    private static Note note(String id, String title, String content, NoteType type, int importance, String... tags) {
        return new Note(id, title, content, Set.of(tags), type, importance, CREATED, CREATED);
    }

    private static void link(List<NoteRelationship> links, String id, String first, String second) {
        links.add(new NoteRelationship("sample-" + id, first, second, RelationshipType.RELATED,
                RelationshipOrigin.MANUAL, null));
    }
}
