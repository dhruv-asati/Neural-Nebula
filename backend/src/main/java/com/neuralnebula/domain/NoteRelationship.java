package com.neuralnebula.domain;

import java.util.Objects;

/** An undirected conceptual connection; it never implies a learning prerequisite. */
public record NoteRelationship(
        String id,
        String sourceNoteId,
        String targetNoteId,
        RelationshipType type,
        RelationshipOrigin origin,
        Double similarityScore) {

    public NoteRelationship {
        id = requireText(id, "id");
        sourceNoteId = requireText(sourceNoteId, "sourceNoteId");
        targetNoteId = requireText(targetNoteId, "targetNoteId");
        if (sourceNoteId.equals(targetNoteId)) {
            throw new IllegalArgumentException("a relationship cannot connect a note to itself");
        }
        type = Objects.requireNonNull(type, "type cannot be null");
        origin = Objects.requireNonNull(origin, "origin cannot be null");
        if (origin == RelationshipOrigin.SUGGESTED) {
            if (similarityScore == null || !Double.isFinite(similarityScore)
                    || similarityScore < 0.0 || similarityScore > 1.0) {
                throw new IllegalArgumentException("suggested relationships require a similarity score from 0 to 1");
            }
        } else if (similarityScore != null) {
            throw new IllegalArgumentException("manual relationships do not have a similarity score");
        }
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field + " cannot be null");
        if (value.isBlank()) throw new IllegalArgumentException(field + " cannot be blank");
        return value;
    }
}
