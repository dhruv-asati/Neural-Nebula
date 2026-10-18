package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class KnowledgeBaseTest {
    private Note note(String id) {
        return new Note(id, "Title", "", Set.of(), NoteType.CONCEPT, 0, Instant.EPOCH, Instant.EPOCH);
    }

    @Test
    void registrationAndRemovalKeepLookupAndGraphAligned() {
        KnowledgeBase base = new KnowledgeBase();
        base.register(note("a"));
        base.register(note("b"));
        base.graph().addEdge("a", "b");
        assertThrows(IllegalArgumentException.class, () -> base.register(note("a")));
        assertEquals(2, base.graph().vertexCount());
        assertTrue(base.findById("a").isPresent());
        assertTrue(base.remove("a"));
        assertTrue(base.findById("a").isEmpty());
        assertFalse(base.graph().containsVertex("a"));
        assertEquals(0, base.graph().edgeCount());
    }
}
