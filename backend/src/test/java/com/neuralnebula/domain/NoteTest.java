package com.neuralnebula.domain;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class NoteTest {
    private final Instant now = Instant.parse("2026-10-18T00:00:00Z");

    @Test
    void createsValidNoteAndCopiesTags() {
        var tags = new HashSet<>(Set.of("graphs"));
        Note note = new Note("n1", "Graph", "Adjacency lists", tags, NoteType.CONCEPT, 80, now, now);
        tags.add("changed");
        assertEquals(Set.of("graphs"), note.tags());
    }

    @Test
    void rejectsInvalidFieldsAndTimestampOrder() {
        assertThrows(IllegalArgumentException.class, () ->
                new Note(" ", "Title", "", Set.of(), NoteType.CONCEPT, 50, now, now));
        assertThrows(IllegalArgumentException.class, () ->
                new Note("n", "Title", "", Set.of(), NoteType.CONCEPT, 101, now, now));
        assertThrows(IllegalArgumentException.class, () ->
                new Note("n", "Title", "", Set.of(), NoteType.CONCEPT, 50, now, now.minusSeconds(1)));
    }
}
