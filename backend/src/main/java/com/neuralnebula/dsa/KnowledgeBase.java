package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;

import java.util.Objects;
import java.util.Optional;
import java.util.List;

/** Small coordinator that keeps registered notes and graph vertices in sync. */
public final class KnowledgeBase {
    private final NoteLookup noteLookup;
    private final NoteGraph noteGraph;
    private final KeywordIndex keywordIndex;
    private final AutocompleteTrie autocompleteTrie = new AutocompleteTrie();

    public KnowledgeBase() {
        this(new NoteLookup(), new NoteGraph(), new KeywordIndex(new KeywordNormalizer()));
    }

    KnowledgeBase(NoteLookup noteLookup, NoteGraph noteGraph, KeywordIndex keywordIndex) {
        this.noteLookup = Objects.requireNonNull(noteLookup);
        this.noteGraph = Objects.requireNonNull(noteGraph);
        this.keywordIndex = Objects.requireNonNull(keywordIndex);
    }

    public void register(Note note) {
        Objects.requireNonNull(note, "note cannot be null");
        // Check both sides before changing either, so duplicate IDs cannot split the state.
        if (noteLookup.containsId(note.id()) || noteGraph.containsVertex(note.id())) {
            throw new IllegalArgumentException("note ID already exists: " + note.id());
        }
        noteLookup.register(note);
        noteGraph.addVertex(note.id());
        keywordIndex.index(note);
        autocompleteTrie.rebuild(keywordIndex.allTerms());
    }

    public Optional<Note> findById(String id) { return noteLookup.findById(id); }

    /** Replaces an existing immutable note and refreshes its indexed keywords. */
    public void update(Note note) {
        Objects.requireNonNull(note, "note cannot be null");
        if (!noteLookup.containsId(note.id())) throw new IllegalArgumentException("note does not exist: " + note.id());
        keywordIndex.update(note);
        autocompleteTrie.rebuild(keywordIndex.allTerms());
        // IDs are immutable and the graph vertex remains unchanged.
        noteLookup.replace(note);
    }

    public boolean remove(String id) {
        Optional<Note> removed = noteLookup.remove(id);
        if (removed.isEmpty()) return false;
        noteGraph.removeVertex(id);
        keywordIndex.remove(id);
        autocompleteTrie.rebuild(keywordIndex.allTerms());
        return true;
    }

    public NoteGraph graph() { return noteGraph; }
    public KeywordIndex keywordIndex() { return keywordIndex; }
    public AutocompleteTrie autocompleteTrie() { return autocompleteTrie; }
    public List<Note> notes() {
        return noteLookup.notes();
    }
}
