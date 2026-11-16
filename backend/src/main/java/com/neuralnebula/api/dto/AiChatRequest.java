package com.neuralnebula.api.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record AiChatRequest(
        @NotBlank @Size(max = 128) String noteId,
        @NotBlank @Size(max = 4000) String message,
        @Size(max = 40) List<@Valid HistoryTurn> history) {

    public record HistoryTurn(
            @NotBlank @Pattern(regexp = "USER|ASSISTANT") String role,
            @NotBlank @Size(max = 2000) String content) { }
}
