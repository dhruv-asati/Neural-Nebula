package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/** Inverted index: normalized term -> note IDs, plus each note's terms for efficient updates. */
public final class KeywordIndex {
    public enum MatchMode { AND, OR }

    private final KeywordNormalizer normalizer;
    private final Map<String, Set<String>> noteIdsByTerm = new HashMap<>();
    private final Map<String, Set<String>> termsByNoteId = new HashMap<>();

    public KeywordIndex(KeywordNormalizer normalizer) {
        this.normalizer = Objects.requireNonNull(normalizer);
    }

    public void index(Note note) {
        Objects.requireNonNull(note, "note cannot be null");
        if (termsByNoteId.containsKey(note.id())) throw new IllegalArgumentException("note is already indexed: " + note.id());
        add(note.id(), normalizer.normalize(note));
    }

    /** Replaces an existing note's terms, or indexes it if this is the first version. */
    public void update(Note note) {
        Objects.requireNonNull(note, "note cannot be null");
        remove(note.id());
        add(note.id(), normalizer.normalize(note));
    }

    public boolean remove(String noteId) {
        Set<String> oldTerms = termsByNoteId.remove(requireText(noteId, "noteId"));
        if (oldTerms == null) return false;
        for (String term : oldTerms) {
            Set<String> ids = noteIdsByTerm.get(term);
            ids.remove(noteId);
            if (ids.isEmpty()) noteIdsByTerm.remove(term);
        }
        return true;
    }

    /** Exact normalized keyword lookup. */
    public Set<String> findByKeyword(String keyword) {
        Set<String> terms = normalizer.normalize(keyword);
        if (terms.isEmpty()) return Set.of();
        TreeSet<String> result = new TreeSet<>();
        for (String term : terms) result.addAll(noteIdsByTerm.getOrDefault(term, Set.of()));
        return Collections.unmodifiableSet(result);
    }

    /** AND requires every normalized query term; OR requires at least one. Results are sorted. */
    public List<String> search(String query, MatchMode mode) {
        Objects.requireNonNull(mode, "mode cannot be null");
        TreeSet<String> terms = new TreeSet<>(normalizer.normalize(query));
        if (terms.isEmpty()) return List.of();
        Set<String> result = null;
        for (String term : terms) {
            Set<String> ids = noteIdsByTerm.getOrDefault(term, Set.of());
            if (result == null) result = new HashSet<>(ids);
            else if (mode == MatchMode.AND) result.retainAll(ids);
            else result.addAll(ids);
            if (mode == MatchMode.AND && result.isEmpty()) break;
        }
        return result == null ? List.of() : result.stream().sorted().toList();
    }

    public Set<String> termsForNote(String noteId) {
        return Collections.unmodifiableSet(new TreeSet<>(termsByNoteId.getOrDefault(requireText(noteId, "noteId"), Set.of())));
    }

    public Set<String> allTerms() { return Collections.unmodifiableSet(new TreeSet<>(noteIdsByTerm.keySet())); }
    public Set<String> indexedNoteIds() { return Collections.unmodifiableSet(new TreeSet<>(termsByNoteId.keySet())); }

    /** Candidate IDs sharing at least one normalized term with the supplied terms. */
    public Set<String> candidatesFor(Set<String> terms) {
        TreeSet<String> candidates = new TreeSet<>();
        for (String term : terms) candidates.addAll(noteIdsByTerm.getOrDefault(term, Set.of()));
        return Collections.unmodifiableSet(candidates);
    }

    private void add(String id, Set<String> terms) {
        termsByNoteId.put(id, Set.copyOf(terms));
        for (String term : terms) noteIdsByTerm.computeIfAbsent(term, ignored -> new HashSet<>()).add(id);
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field + " cannot be null");
        if (value.isBlank()) throw new IllegalArgumentException(field + " cannot be blank");
        return value;
    }
}
