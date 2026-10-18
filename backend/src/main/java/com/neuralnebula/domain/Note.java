package com.neuralnebula.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.Set;

/** Immutable note; updatedAt must be equal to or later than createdAt. */
public record Note(
        String id,
        String title,
        String content,
        Set<String> tags,
        NoteType type,
        int importance,
        Instant createdAt,
        Instant updatedAt) {

    public Note {
        id = requireText(id, "id");
        title = requireText(title, "title");
        content = Objects.requireNonNull(content, "content cannot be null");
        tags = Set.copyOf(Objects.requireNonNull(tags, "tags cannot be null"));
        if (tags.stream().anyMatch(tag -> tag == null || tag.isBlank())) {
            throw new IllegalArgumentException("tags cannot contain blank values");
        }
        type = Objects.requireNonNull(type, "type cannot be null");
        if (importance < 0 || importance > 100) {
            throw new IllegalArgumentException("importance must be between 0 and 100");
        }
        createdAt = Objects.requireNonNull(createdAt, "createdAt cannot be null");
        updatedAt = Objects.requireNonNull(updatedAt, "updatedAt cannot be null");
        if (updatedAt.isBefore(createdAt)) {
            throw new IllegalArgumentException("updatedAt cannot be before createdAt");
        }
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field + " cannot be null");
        if (value.isBlank()) {
            throw new IllegalArgumentException(field + " cannot be blank");
        }
        return value;
    }
}
