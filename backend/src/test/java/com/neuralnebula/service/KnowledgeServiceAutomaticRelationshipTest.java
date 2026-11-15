package com.neuralnebula.service;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteRelationship;
import com.neuralnebula.domain.NoteType;
import com.neuralnebula.domain.RelationshipOrigin;
import com.neuralnebula.domain.RelationshipType;
import com.neuralnebula.persistence.JsonFileStore;
import com.neuralnebula.service.ApiConflictException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Path;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class KnowledgeServiceAutomaticRelationshipTest {
    @TempDir Path temporaryDirectory;

    @Test
    void stronglyRelatedNoteCreationCreatesOnePersistedAutomaticEdge() {
        KnowledgeService service = service("automatic-create.json");
        Note first = service.createNote("Distributed Graph Algorithms",
                "Traversal explores connected vertices and edges in weighted networks.",
                Set.of("graph", "algorithms", "networks"), NoteType.CONCEPT, 70);

        Note second = service.createNote("Graph Algorithms for Distributed Networks",
                "Traversal explores connected vertices and edges in weighted networks.",
                Set.of("graph", "algorithms", "networks"), NoteType.CONCEPT, 65);

        List<NoteRelationship> relationships = service.graph().relationships();
        assertEquals(1, relationships.size());
        NoteRelationship edge = relationships.getFirst();
        assertEquals(RelationshipOrigin.AUTOMATIC, edge.origin());
        assertEquals(RelationshipType.RELATED, edge.type());
        assertNotNull(edge.similarityScore());
        assertTrue(edge.similarityScore() >= 0.62);
        assertTrue(Set.of(edge.sourceNoteId(), edge.targetNoteId()).containsAll(Set.of(first.id(), second.id())));

        KnowledgeService reloaded = new KnowledgeService(store("automatic-create.json"), false);
        assertEquals(edge, reloaded.graph().relationships().getFirst());
    }

    @Test
    void unrelatedNotesDoNotConnectAndSingleSharedGenericTagDoesNotCreateSuggestions() {
        KnowledgeService service = service("unrelated.json");
        Note first = service.createNote("Ocean Photography", "Long exposure captures moonlit waves and coastlines.",
                Set.of("ocean", "photography", "graph"), NoteType.RESOURCE, 40);
        Note second = service.createNote("Binary Search", "Find an ordered value in a sorted sequence.",
                Set.of("algorithms", "search", "graph"), NoteType.CONCEPT, 45);

        assertTrue(service.graph().relationships().isEmpty());
        assertTrue(service.relationshipSuggestions(first.id(), 0.1).stream()
                .noneMatch(suggestion -> suggestion.noteId().equals(second.id())));
    }

    @Test
    void mediumMatchIsExplainedAsSuggestionAndDoesNotCreateAnEdge() {
        KnowledgeService service = service("medium-match.json");
        Note first = service.createNote("Binary Search", "Efficiently locate ordered values in sorted sequences.",
                Set.of("algorithms", "search"), NoteType.CONCEPT, 60);
        Note second = service.createNote("Binary Search Tree", "Balanced nodes store ordered keys and data.",
                Set.of("algorithms", "trees"), NoteType.CONCEPT, 55);

        assertTrue(service.graph().relationships().isEmpty());
        var suggestion = service.relationshipSuggestions(first.id(), 0.1).stream()
                .filter(match -> match.noteId().equals(second.id())).findFirst().orElseThrow();
        assertTrue(suggestion.similarity() >= 0.28 && suggestion.similarity() < 0.62);
        assertNotNull(suggestion.reason());
        assertTrue(suggestion.reason().contains("Shared terms"));
    }

    @Test
    void noteEditsKeepManualLinksRemoveOnlyStaleAutomaticLinksAndAvoidDuplicates() {
        KnowledgeService service = service("edit-links.json");
        Note first = service.createNote("Distributed Graph Algorithms",
                "Traversal explores connected vertices and edges in weighted networks.",
                Set.of("graph", "algorithms", "networks"), NoteType.CONCEPT, 70);
        Note second = service.createNote("Graph Algorithms for Distributed Networks",
                "Traversal explores connected vertices and edges in weighted networks.",
                Set.of("graph", "algorithms", "networks"), NoteType.CONCEPT, 65);
        Note third = service.createNote("Photography Basics", "Aperture controls exposure and depth of field.",
                Set.of("camera", "photography"), NoteType.RESOURCE, 35);
        NoteRelationship automatic = service.graph().relationships().getFirst();
        NoteRelationship manual = service.createManualRelationship(first.id(), third.id(), RelationshipType.RELATED);

        service.updateNote(first.id(), first.title(), first.content(), first.tags(), first.type(), 71);
        assertEquals(2, service.graph().relationships().size());
        assertEquals(automatic.id(), service.graph().relationships().stream()
                .filter(edge -> edge.origin() == RelationshipOrigin.AUTOMATIC).findFirst().orElseThrow().id());

        service.updateNote(first.id(), "Ocean Photography", "Moonlit waves and coastal exposure.",
                Set.of("ocean", "photography"), NoteType.RESOURCE, 71);
        assertEquals(List.of(manual), service.graph().relationships());
        assertEquals(RelationshipOrigin.MANUAL, service.graph().relationships().getFirst().origin());
    }

    @Test
    void repeatedManualRelationshipIsStillRejectedWhenAutoLinkAlreadyExists() {
        KnowledgeService service = service("duplicate.json");
        Note first = service.createNote("Distributed Graph Algorithms",
                "Traversal explores connected vertices and edges in weighted networks.",
                Set.of("graph", "algorithms", "networks"), NoteType.CONCEPT, 70);
        Note second = service.createNote("Graph Algorithms for Distributed Networks",
                "Traversal explores connected vertices and edges in weighted networks.",
                Set.of("graph", "algorithms", "networks"), NoteType.CONCEPT, 65);

        assertEquals(1, service.graph().relationships().size());
        assertThrows(ApiConflictException.class,
                () -> service.createManualRelationship(first.id(), second.id(), RelationshipType.RELATED));
        assertEquals(1, service.graph().relationships().size());
    }

    private KnowledgeService service(String filename) { return new KnowledgeService(store(filename), false); }

    private JsonFileStore store(String filename) {
        JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
        return new JsonFileStore(temporaryDirectory.resolve(filename), mapper);
    }
}
