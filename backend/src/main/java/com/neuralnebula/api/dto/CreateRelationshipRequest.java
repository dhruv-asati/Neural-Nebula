package com.neuralnebula.api.dto;

import com.neuralnebula.domain.RelationshipType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateRelationshipRequest(@NotBlank String sourceNoteId,
                                        @NotBlank String targetNoteId,
                                        @NotNull RelationshipType type) { }
