package com.neuralnebula.api.dto;

import com.neuralnebula.domain.PrerequisiteDependency;

public record PrerequisiteResponse(String prerequisiteNoteId, String dependentNoteId) {
    public static PrerequisiteResponse from(PrerequisiteDependency dependency) {
        return new PrerequisiteResponse(dependency.prerequisiteNoteId(), dependency.dependentNoteId());
    }
}
