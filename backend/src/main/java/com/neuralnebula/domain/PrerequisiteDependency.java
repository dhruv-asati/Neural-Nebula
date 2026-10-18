package com.neuralnebula.domain;

import java.util.Objects;

/** Directed learning dependency: prerequisiteNoteId must be learned before dependentNoteId. */
public record PrerequisiteDependency(String prerequisiteNoteId, String dependentNoteId) {
    public PrerequisiteDependency {
        prerequisiteNoteId = requireText(prerequisiteNoteId, "prerequisiteNoteId");
        dependentNoteId = requireText(dependentNoteId, "dependentNoteId");
        if (prerequisiteNoteId.equals(dependentNoteId)) {
            throw new IllegalArgumentException("a note cannot be its own prerequisite");
        }
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field + " cannot be null");
        if (value.isBlank()) throw new IllegalArgumentException(field + " cannot be blank");
        return value;
    }
}
