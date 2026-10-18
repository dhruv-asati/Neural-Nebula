package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class NoteMaxHeapTest {
    @Test
    void insertionOrderDoesNotChangeImportanceOrder() {
        List<Note> notes = List.of(note("c", 90), note("a", 40), note("d", 70), note("b", 80));
        for (List<Note> insertion : List.of(notes, List.of(notes.get(3), notes.get(2), notes.get(1), notes.get(0)))) {
            NoteMaxHeap heap = new NoteMaxHeap();
            insertion.forEach(heap::insert);
            assertEquals(List.of("c", "b", "d", "a"), drainIds(heap));
        }
    }

    @Test
    void bottomUpConstructionAndRemovalReturnTheMaximumRepeatedly() {
        NoteMaxHeap heap = new NoteMaxHeap(List.of(note("low", 1), note("high", 99), note("middle", 45)));
        assertEquals("high", heap.peekMax().orElseThrow().id());
        assertEquals("high", heap.removeMax().orElseThrow().id());
        assertEquals("middle", heap.removeMax().orElseThrow().id());
        assertEquals("low", heap.removeMax().orElseThrow().id());
        assertTrue(heap.isEmpty());
        assertEquals(0, heap.size());
    }

    @Test
    void equalImportanceUsesAscendingNoteIdAndEmptyHeapIsSafe() {
        NoteMaxHeap heap = new NoteMaxHeap();
        assertTrue(heap.peekMax().isEmpty());
        assertTrue(heap.removeMax().isEmpty());
        heap.insert(note("z", 50));
        heap.insert(note("a", 50));
        heap.insert(note("m", 50));
        assertEquals(List.of("a", "m", "z"), drainIds(heap));
    }

    private static List<String> drainIds(NoteMaxHeap heap) {
        java.util.ArrayList<String> ids = new java.util.ArrayList<>();
        while (!heap.isEmpty()) ids.add(heap.removeMax().orElseThrow().id());
        return List.copyOf(ids);
    }

    private static Note note(String id, int importance) {
        return new Note(id, id, "", Set.of(), NoteType.CONCEPT, importance, Instant.EPOCH, Instant.EPOCH);
    }
}
