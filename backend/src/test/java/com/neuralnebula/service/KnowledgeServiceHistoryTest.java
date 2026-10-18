package com.neuralnebula.service;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteRelationship;
import com.neuralnebula.domain.NoteType;
import com.neuralnebula.domain.PrerequisiteDependency;
import com.neuralnebula.domain.RelationshipType;
import com.neuralnebula.persistence.JsonFileStore;
import com.neuralnebula.persistence.PersistenceException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class KnowledgeServiceHistoryTest {
    @TempDir Path temporaryDirectory;

    @Test
    void topKValidatesLimitUsesDeterministicTiesAndReflectsUpdates() {
        KnowledgeService service = service("top-k.json");
        Note z = service.createNote("Z note", "zeta topic", Set.of(), NoteType.CONCEPT, 90);
        Note a = service.createNote("A note", "alpha topic", Set.of(), NoteType.RESOURCE, 90);
        Note middle = service.createNote("Middle", "middle topic", Set.of(), NoteType.SUMMARY, 45);

        assertTrue(service.topKImportantNotes(0).isEmpty());
        assertThrows(IllegalArgumentException.class, () -> service.topKImportantNotes(-1));
        List<String> tiedIds = List.of(a.id(), z.id()).stream().sorted().toList();
        assertEquals(List.of(tiedIds.get(0), tiedIds.get(1), middle.id()),
                service.topKImportantNotes(20).stream().map(Note::id).toList());
        assertEquals(List.of(tiedIds.get(0)), service.topKImportantNotes(1).stream().map(Note::id).toList());

        service.updateNote(a.id(), a.title(), a.content(), a.tags(), a.type(), 10);
        assertEquals(List.of(z.id(), middle.id(), a.id()), service.topKImportantNotes(3).stream().map(Note::id).toList());
    }

    @Test
    void noteCreateUpdateDeleteCanUndoAndRedoAndNoOpUpdateDoesNotEnterHistory() {
        KnowledgeService service = service("note-history.json");
        var emptyUndo = service.undo();
        var emptyRedo = service.redo();
        assertFalse(emptyUndo.applied());
        assertFalse(emptyRedo.applied());
        assertEquals(0, service.historyStatus().undoCount());

        Note created = service.createNote("History note", "alpha original", Set.of("history"), NoteType.CONCEPT, 40);
        int historyAfterCreate = service.historyStatus().undoCount();
        Note noOp = service.updateNote(created.id(), created.title(), created.content(), created.tags(), created.type(), created.importance());
        assertEquals(created, noOp);
        assertEquals(historyAfterCreate, service.historyStatus().undoCount());

        Note updated = service.updateNote(created.id(), "History note", "beta revised", Set.of("history", "updated"), NoteType.SUMMARY, 80);
        assertEquals(2, service.historyStatus().undoCount());
        assertTrue(service.search("beta").stream().anyMatch(note -> note.id().equals(created.id())));
        assertTrue(service.undo().applied());
        assertEquals(created, service.getNote(created.id()));
        assertTrue(service.search("alpha").stream().anyMatch(note -> note.id().equals(created.id())));
        assertTrue(service.redo().applied());
        assertEquals(updated, service.getNote(created.id()));
        assertTrue(service.search("beta").stream().anyMatch(note -> note.id().equals(created.id())));

        service.deleteNote(created.id());
        assertTrue(service.undo().applied());
        assertEquals(updated, service.getNote(created.id()));
        assertTrue(service.redo().applied());
        assertTrue(service.listNotes().isEmpty());
    }

    @Test
    void noteDeletionRemovesLinksAndPrerequisitesAndUndoRestoresBothWithoutDanglingReferences() {
        KnowledgeService service = service("dependency-history.json");
        Note prerequisite = service.createNote("Prerequisite", "foundation", Set.of(), NoteType.CONCEPT, 50);
        Note dependent = service.createNote("Dependent", "advanced concept", Set.of(), NoteType.CONCEPT, 60);
        NoteRelationship relationship = service.createManualRelationship(prerequisite.id(), dependent.id(), RelationshipType.RELATED);
        PrerequisiteDependency dependency = service.createPrerequisite(prerequisite.id(), dependent.id());

        service.deleteNote(prerequisite.id());
        assertTrue(service.graph().relationships().isEmpty());
        assertTrue(service.listPrerequisites().isEmpty());
        assertEquals(List.of(dependent.id()), service.listNotes().stream().map(Note::id).toList());

        assertTrue(service.undo().applied());
        assertEquals(2, service.listNotes().size());
        assertEquals(List.of(relationship), service.graph().relationships());
        assertEquals(List.of(dependency), service.listPrerequisites());
        assertEquals(1, service.connectedComponents().componentCount());

        assertTrue(service.redo().applied());
        assertTrue(service.graph().relationships().isEmpty());
        assertTrue(service.listPrerequisites().isEmpty());
    }

    @Test
    void prerequisiteMutationsValidateEndpointsStaySeparateAndClearRedoOnNewMutation() {
        KnowledgeService service = service("prerequisites.json");
        Note first = service.createNote("First", "basic", Set.of(), NoteType.CONCEPT, 20);
        Note second = service.createNote("Second", "next", Set.of(), NoteType.CONCEPT, 30);
        PrerequisiteDependency dependency = service.createPrerequisite(first.id(), second.id());
        assertEquals(List.of(dependency), service.listPrerequisites());
        assertTrue(service.graph().relationships().isEmpty());
        assertThrows(ApiConflictException.class, () -> service.createPrerequisite(first.id(), second.id()));
        assertThrows(IllegalArgumentException.class, () -> service.createPrerequisite(first.id(), first.id()));
        assertThrows(ApiNotFoundException.class, () -> service.createPrerequisite("missing", second.id()));

        service.deletePrerequisite(first.id(), second.id());
        assertTrue(service.listPrerequisites().isEmpty());
        assertTrue(service.undo().applied());
        assertEquals(List.of(dependency), service.listPrerequisites());
        assertTrue(service.undo().applied());
        assertTrue(service.listPrerequisites().isEmpty());
        assertTrue(service.redo().applied());
        assertEquals(List.of(dependency), service.listPrerequisites());
        service.createNote("Branch", "new action", Set.of(), NoteType.QUESTION, 10);
        assertFalse(service.historyStatus().canRedo());
    }

    @Test
    void prerequisiteMutationsSurviveReloadAndRebuildOrdinaryGraphSeparately() {
        Path file = temporaryDirectory.resolve("prerequisite-reload.json");
        JsonFileStore store = new JsonFileStore(file, JsonMapper.builder().findAndAddModules().build());
        KnowledgeService firstRun = new KnowledgeService(store, false);
        Note prerequisite = firstRun.createNote("Prerequisite", "foundation", Set.of("foundation"), NoteType.CONCEPT, 50);
        Note dependent = firstRun.createNote("Dependent", "advanced", Set.of("advanced"), NoteType.CONCEPT, 60);
        PrerequisiteDependency dependency = firstRun.createPrerequisite(prerequisite.id(), dependent.id());

        KnowledgeService afterReload = new KnowledgeService(store, false);
        assertEquals(List.of(dependency), afterReload.listPrerequisites());
        assertTrue(afterReload.graph().relationships().isEmpty());
        assertEquals(2, afterReload.connectedComponents().componentCount());
        assertTrue(afterReload.search("foundation").stream().anyMatch(note -> note.id().equals(prerequisite.id())));
    }

    @Test
    void persistenceFailuresDoNotPublishMutationsOrMoveHistoryStacks() {
        JsonFileStore failedMutationStore = mock(JsonFileStore.class);
        when(failedMutationStore.load()).thenReturn(Optional.empty());
        when(failedMutationStore.exists()).thenReturn(false);
        doThrow(new PersistenceException("test write failure", new java.io.IOException("disk unavailable")))
                .when(failedMutationStore).write(any());
        KnowledgeService failedMutation = new KnowledgeService(failedMutationStore, false);
        assertThrows(PersistenceException.class,
                () -> failedMutation.createNote("Unwritten", "must stay absent", Set.of(), NoteType.CONCEPT, 5));
        assertTrue(failedMutation.listNotes().isEmpty());
        assertEquals(0, failedMutation.historyStatus().undoCount());

        JsonFileStore failedUndoStore = mock(JsonFileStore.class);
        when(failedUndoStore.load()).thenReturn(Optional.empty());
        when(failedUndoStore.exists()).thenReturn(false);
        doNothing().doThrow(new PersistenceException("test write failure", new java.io.IOException("disk unavailable")))
                .when(failedUndoStore).write(any());
        KnowledgeService failedUndo = new KnowledgeService(failedUndoStore, false);
        Note retained = failedUndo.createNote("Retained", "still present", Set.of(), NoteType.CONCEPT, 5);
        var beforeUndo = failedUndo.historyStatus();
        assertThrows(PersistenceException.class, failedUndo::undo);
        assertEquals(retained, failedUndo.getNote(retained.id()));
        assertEquals(beforeUndo, failedUndo.historyStatus());

        JsonFileStore failedRedoStore = mock(JsonFileStore.class);
        when(failedRedoStore.load()).thenReturn(Optional.empty());
        when(failedRedoStore.exists()).thenReturn(false);
        doNothing().doNothing()
                .doThrow(new PersistenceException("test write failure", new java.io.IOException("disk unavailable")))
                .when(failedRedoStore).write(any());
        KnowledgeService failedRedo = new KnowledgeService(failedRedoStore, false);
        Note replayed = failedRedo.createNote("Replay", "redo later", Set.of(), NoteType.CONCEPT, 5);
        assertTrue(failedRedo.undo().applied());
        var beforeRedo = failedRedo.historyStatus();
        assertThrows(PersistenceException.class, failedRedo::redo);
        assertTrue(failedRedo.listNotes().isEmpty());
        assertEquals(beforeRedo, failedRedo.historyStatus());
        assertNotNull(replayed.id());
    }

    private KnowledgeService service(String filename) {
        JsonFileStore store = new JsonFileStore(temporaryDirectory.resolve(filename),
                JsonMapper.builder().findAndAddModules().build());
        return new KnowledgeService(store, false);
    }
}
