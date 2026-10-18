package com.neuralnebula.persistence;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteRelationship;
import com.neuralnebula.domain.PrerequisiteDependency;

import java.util.List;

/** Canonical schema-v1 data. Derived indexes and graph adjacency lists are intentionally omitted. */
public record PersistedData(int schemaVersion, List<Note> notes,
                            List<NoteRelationship> relationships,
                            List<PrerequisiteDependency> prerequisites) {
    public static final int CURRENT_SCHEMA_VERSION = 1;

    public PersistedData {
        notes = List.copyOf(notes);
        relationships = List.copyOf(relationships);
        prerequisites = List.copyOf(prerequisites);
    }
}
