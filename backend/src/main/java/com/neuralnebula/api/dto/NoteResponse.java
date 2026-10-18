package com.neuralnebula.api.dto;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteType;

import java.time.Instant;
import java.util.Set;

public record NoteResponse(String id, String title, String content, Set<String> tags, NoteType type,
                           int importance, Instant createdAt, Instant updatedAt) {
    public static NoteResponse from(Note note) {
        return new NoteResponse(note.id(), note.title(), note.content(), note.tags(), note.type(),
                note.importance(), note.createdAt(), note.updatedAt());
    }
}
