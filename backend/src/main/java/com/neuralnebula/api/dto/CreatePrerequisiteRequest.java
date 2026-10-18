package com.neuralnebula.api.dto;

import jakarta.validation.constraints.NotBlank;

public record CreatePrerequisiteRequest(@NotBlank String prerequisiteNoteId,
                                        @NotBlank String dependentNoteId) { }
