package com.neuralnebula.persistence;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteRelationship;
import com.neuralnebula.domain.NoteType;
import com.neuralnebula.domain.RelationshipOrigin;
import com.neuralnebula.domain.RelationshipType;
import com.neuralnebula.dsa.KeywordIndex;
import com.neuralnebula.service.KnowledgeService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class JsonPersistenceTest {
    @TempDir Path temporaryDirectory;

    private JsonFileStore store(Path path) {
        return new JsonFileStore(path, JsonMapper.builder().findAndAddModules().build());
    }

    @Test
    void serializesAndDeserializesVersionedCanonicalData() {
        Path file = temporaryDirectory.resolve("knowledge.json");
        PersistedData source = new PersistedData(1,
                List.of(note("a", "Graph"), note("b", "Search")),
                List.of(new NoteRelationship("r", "a", "b", RelationshipType.RELATED, RelationshipOrigin.MANUAL, null)),
                List.of());
        JsonFileStore store = store(file);
        store.write(source);
        assertEquals(source, store.load().orElseThrow());
        assertTrue(Files.exists(file));
    }

    @Test
    void mutationsSurviveReloadAndRebuildGraphAndKeywordStructures() {
        Path file = temporaryDirectory.resolve("knowledge.json");
        KnowledgeService firstRun = new KnowledgeService(store(file), false);
        Note first = firstRun.createNote("Graph Theory", "Vertices and edges", Set.of("dsa"), NoteType.CONCEPT, 90);
        Note second = firstRun.createNote("Breadth First Search", "Graph traversal", Set.of("graphs"), NoteType.CONCEPT, 80);
        NoteRelationship link = firstRun.createManualRelationship(first.id(), second.id(), RelationshipType.RELATED);
        firstRun.updateNote(second.id(), "BFS Graph Search", "Queue-based graph traversal", Set.of("graphs"), NoteType.SUMMARY, 85);

        KnowledgeService afterRestart = new KnowledgeService(store(file), false);
        assertEquals(2, afterRestart.listNotes().size());
        assertEquals("BFS Graph Search", afterRestart.getNote(second.id()).title());
        assertEquals(1, afterRestart.graph().relationships().size());
        assertEquals(1, afterRestart.connectedComponents().componentCount());
        assertEquals(List.of(first.id(), second.id()), afterRestart.shortestPath(first.id(), second.id()).path());
        assertEquals(List.of(second.id()), afterRestart.search("queue").stream().map(Note::id).toList());

        afterRestart.deleteRelationship(link.id());
        afterRestart.deleteNote(first.id());
        KnowledgeService afterSecondRestart = new KnowledgeService(store(file), false);
        assertEquals(List.of(second.id()), afterSecondRestart.listNotes().stream().map(Note::id).toList());
        assertTrue(afterSecondRestart.graph().relationships().isEmpty());
    }

    @Test
    void malformedAndInvalidCanonicalFilesFailClearly() throws Exception {
        Path file = temporaryDirectory.resolve("bad.json");
        Files.writeString(file, "{broken");
        assertThrows(IllegalStateException.class, () -> new KnowledgeService(store(file), true));

        PersistedData duplicateIds = new PersistedData(1, List.of(note("same", "One"), note("same", "Two")), List.of(), List.of());
        store(file).write(duplicateIds);
        IllegalStateException invalidIds = assertThrows(IllegalStateException.class,
                () -> new KnowledgeService(store(file), false));
        assertTrue(invalidIds.getMessage().contains("validation"));

        PersistedData dangling = new PersistedData(1, List.of(note("only", "Only")),
                List.of(new NoteRelationship("r", "only", "missing", RelationshipType.RELATED, RelationshipOrigin.MANUAL, null)), List.of());
        store(file).write(dangling);
        assertThrows(IllegalStateException.class, () -> new KnowledgeService(store(file), false));

        Files.writeString(file, """
                {"schemaVersion":1,"notes":[{"id":"bad","title":"Bad","content":"","tags":[],"type":"CONCEPT","importance":101,"createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"}],"relationships":[],"prerequisites":[]}
                """);
        assertThrows(IllegalStateException.class, () -> new KnowledgeService(store(file), false));
        store(file).write(new PersistedData(99, List.of(), List.of(), List.of()));
        assertThrows(IllegalStateException.class, () -> new KnowledgeService(store(file), false));
    }

    @Test
    void failedWriteLeavesPublishedMemoryAndCanonicalFileUnchanged() throws Exception {
        Path blocker = temporaryDirectory.resolve("not-a-directory");
        Files.writeString(blocker, "occupied");
        Path file = blocker.resolve("knowledge.json");
        KnowledgeService service = new KnowledgeService(store(file), false);
        assertThrows(PersistenceException.class,
                () -> service.createNote("Not saved", "Must not publish", Set.of(), NoteType.CONCEPT, 50));
        assertTrue(service.listNotes().isEmpty());
        assertFalse(Files.exists(file));
    }

    @Test
    void sampleSeedRunsOnlyForMissingFileAndNeverOverwritesExistingData() {
        Path file = temporaryDirectory.resolve("seed.json");
        KnowledgeService seeded = new KnowledgeService(store(file), true);
        assertEquals(20, seeded.listNotes().size());
        assertEquals(20, seeded.graph().relationships().size());
        assertTrue(seeded.connectedComponents().components().contains(List.of("research-question")));
        assertTrue(seeded.topicCommunities().communities().stream().anyMatch(group -> group.size() >= 5));
        seeded.createNote("My note", "Persistent user data", Set.of("user"), NoteType.QUESTION, 55);
        KnowledgeService restartedWithSeedFlag = new KnowledgeService(store(file), true);
        assertEquals(21, restartedWithSeedFlag.listNotes().size());
        assertTrue(restartedWithSeedFlag.listNotes().stream().anyMatch(note -> note.title().equals("My note")));
    }

    @Test
    void duplicateUndirectedEdgesAndDanglingPrerequisitesAreRejected() throws Exception {
        Path file = temporaryDirectory.resolve("invalid-relations.json");
        PersistedData duplicateEdges = new PersistedData(1, List.of(note("a", "A"), note("b", "B")),
                List.of(new NoteRelationship("r1", "a", "b", RelationshipType.RELATED, RelationshipOrigin.MANUAL, null),
                        new NoteRelationship("r2", "b", "a", RelationshipType.REFERENCES, RelationshipOrigin.MANUAL, null)), List.of());
        store(file).write(duplicateEdges);
        assertThrows(IllegalStateException.class, () -> new KnowledgeService(store(file), false));
        PersistedData danglingPrerequisite = new PersistedData(1, List.of(note("a", "A")), List.of(),
                List.of(new com.neuralnebula.domain.PrerequisiteDependency("missing", "a")));
        store(file).write(danglingPrerequisite);
        assertThrows(IllegalStateException.class, () -> new KnowledgeService(store(file), false));
    }

    @Test
    void prerequisitesPersistSeparatelyAndNeverBecomeOrdinaryGraphEdges() {
        Path file = temporaryDirectory.resolve("prerequisites.json");
        PersistedData data = new PersistedData(1, List.of(note("a", "A"), note("b", "B")),
                List.of(new NoteRelationship("ordinary", "a", "b", RelationshipType.RELATED, RelationshipOrigin.MANUAL, null)),
                List.of(new com.neuralnebula.domain.PrerequisiteDependency("a", "b")));
        store(file).write(data);
        KnowledgeService service = new KnowledgeService(store(file), false);
        assertEquals(1, service.graph().relationships().size());
        service.createNote("C", "C content", Set.of(), NoteType.CONCEPT, 40);
        assertEquals(1, store(file).load().orElseThrow().prerequisites().size());
    }

    private static Note note(String id, String title) {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");
        return new Note(id, title, "Example content", Set.of("sample"), NoteType.CONCEPT, 50, now, now);
    }
}
