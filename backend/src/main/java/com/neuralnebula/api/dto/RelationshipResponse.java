package com.neuralnebula.api.dto;

import com.neuralnebula.domain.NoteRelationship;
import com.neuralnebula.domain.RelationshipOrigin;
import com.neuralnebula.domain.RelationshipType;

public record RelationshipResponse(String id, String sourceNoteId, String targetNoteId, RelationshipType type,
                                   RelationshipOrigin origin, Double similarityScore) {
    public static RelationshipResponse from(NoteRelationship relationship) {
        return new RelationshipResponse(relationship.id(), relationship.sourceNoteId(), relationship.targetNoteId(),
                relationship.type(), relationship.origin(), relationship.similarityScore());
    }
}
