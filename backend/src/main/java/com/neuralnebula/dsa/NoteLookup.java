package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.List;

/** Expected O(1) insert, lookup, contains, and removal using Java's HashMap. */
public final class NoteLookup {
    private final Map<String, Note> notesById = new HashMap<>();

    /** Adds a note; duplicate IDs are rejected and do not replace the existing note. */
    public void register(Note note) {
        Objects.requireNonNull(note, "note cannot be null");
        if (notesById.putIfAbsent(note.id(), note) != null) {
            throw new IllegalArgumentException("note ID already exists: " + note.id());
        }
    }

    /** Replaces a registered immutable note while preserving its ID. */
    public void replace(Note note) {
        Objects.requireNonNull(note, "note cannot be null");
        if (!notesById.containsKey(note.id())) throw new IllegalArgumentException("note does not exist: " + note.id());
        notesById.put(note.id(), note);
    }

    /** Returns empty when no note has the requested ID. */
    public Optional<Note> findById(String id) {
        return Optional.ofNullable(notesById.get(requireId(id)));
    }

    public boolean containsId(String id) {
        return notesById.containsKey(requireId(id));
    }

    /** Removes a note, returning empty when the ID was not present. */
    public Optional<Note> remove(String id) {
        return Optional.ofNullable(notesById.remove(requireId(id)));
    }

    /** Immutable deterministic snapshot for analysis services. */
    public List<Note> notes() { return notesById.values().stream().sorted(java.util.Comparator.comparing(Note::id)).toList(); }

    private static String requireId(String id) {
        Objects.requireNonNull(id, "id cannot be null");
        if (id.isBlank()) throw new IllegalArgumentException("id cannot be blank");
        return id;
    }
}
