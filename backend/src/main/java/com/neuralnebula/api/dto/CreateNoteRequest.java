package com.neuralnebula.api.dto;

import com.neuralnebula.domain.NoteType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record CreateNoteRequest(
        @NotBlank @Size(max = 200) String title,
        @NotNull @Size(max = 100_000) String content,
        @NotNull Set<@NotBlank @Size(max = 40) String> tags,
        @NotNull NoteType type,
        @Min(0) @Max(100) int importance) { }
