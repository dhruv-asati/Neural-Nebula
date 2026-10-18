package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class NoteLookupTest {
    private Note note(String id) {
        Instant now = Instant.EPOCH;
        return new Note(id, "Title", "", Set.of(), NoteType.CONCEPT, 0, now, now);
    }

    @Test
    void registersFindsAndRemovesNotes() {
        NoteLookup lookup = new NoteLookup();
        Note note = note("n1");
        lookup.register(note);
        assertTrue(lookup.containsId("n1"));
        assertEquals(note, lookup.findById("n1").orElseThrow());
        assertTrue(lookup.findById("absent").isEmpty());
        assertEquals(note, lookup.remove("n1").orElseThrow());
        assertFalse(lookup.containsId("n1"));
        assertTrue(lookup.remove("n1").isEmpty());
    }

    @Test
    void duplicateIdsDoNotReplaceExistingNote() {
        NoteLookup lookup = new NoteLookup();
        Note original = note("n1");
        lookup.register(original);
        assertThrows(IllegalArgumentException.class, () -> lookup.register(note("n1")));
        assertEquals(original, lookup.findById("n1").orElseThrow());
    }
}
