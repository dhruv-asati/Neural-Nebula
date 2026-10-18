package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/** Max-heap ordered by note importance, then note ID ascending for deterministic ties. */
public final class NoteMaxHeap {
    private final List<Note> items;

    public NoteMaxHeap() {
        this.items = new ArrayList<>();
    }

    /** Builds a heap in O(n) using bottom-up heap construction. */
    public NoteMaxHeap(Collection<Note> notes) {
        Objects.requireNonNull(notes, "notes cannot be null");
        this.items = new ArrayList<>(notes);
        if (this.items.stream().anyMatch(Objects::isNull)) throw new NullPointerException("notes cannot contain null");
        for (int i = items.size() / 2 - 1; i >= 0; i--) siftDown(i);
    }

    public void insert(Note note) {
        items.add(Objects.requireNonNull(note, "note cannot be null"));
        siftUp(items.size() - 1);
    }

    public Optional<Note> peekMax() {
        return items.isEmpty() ? Optional.empty() : Optional.of(items.getFirst());
    }

    public Optional<Note> removeMax() {
        if (items.isEmpty()) return Optional.empty();
        Note maximum = items.getFirst();
        Note last = items.removeLast();
        if (!items.isEmpty()) {
            items.set(0, last);
            siftDown(0);
        }
        return Optional.of(maximum);
    }

    public int size() { return items.size(); }

    public boolean isEmpty() { return items.isEmpty(); }

    private void siftUp(int child) {
        while (child > 0) {
            int parent = (child - 1) / 2;
            if (!hasHigherPriority(items.get(child), items.get(parent))) return;
            swap(child, parent);
            child = parent;
        }
    }

    private void siftDown(int parent) {
        while (true) {
            int left = parent * 2 + 1;
            int right = left + 1;
            int highest = parent;
            if (left < items.size() && hasHigherPriority(items.get(left), items.get(highest))) highest = left;
            if (right < items.size() && hasHigherPriority(items.get(right), items.get(highest))) highest = right;
            if (highest == parent) return;
            swap(parent, highest);
            parent = highest;
        }
    }

    private void swap(int first, int second) {
        Note note = items.get(first);
        items.set(first, items.get(second));
        items.set(second, note);
    }

    private static boolean hasHigherPriority(Note first, Note second) {
        if (first.importance() != second.importance()) return first.importance() > second.importance();
        return first.id().compareTo(second.id()) < 0;
    }
}
