package com.neuralnebula.dsa;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/** Character trie with lexicographically ordered prefix results. Terms are lowercased on input. */
public final class AutocompleteTrie {
    private static final class Node {
        private final Map<Character, Node> children = new TreeMap<>();
        private boolean terminal;
    }
    private final Node root = new Node();

    public void insert(String term) {
        String normalized = normalize(term);
        if (normalized.isEmpty()) return;
        Node node = root;
        for (char ch : normalized.toCharArray()) node = node.children.computeIfAbsent(ch, ignored -> new Node());
        node.terminal = true;
    }

    /** Replaces the complete vocabulary; useful when indexed terms change or are deleted. */
    public void rebuild(Iterable<String> terms) {
        root.children.clear();
        root.terminal = false;
        for (String term : terms) insert(term);
    }

    public List<String> searchByPrefix(String prefix, int limit) {
        if (limit < 0) throw new IllegalArgumentException("limit cannot be negative");
        if (limit == 0) return List.of();
        String normalized = normalize(prefix);
        Node node = root;
        for (char ch : normalized.toCharArray()) {
            node = node.children.get(ch);
            if (node == null) return List.of();
        }
        List<String> matches = new ArrayList<>();
        collect(node, new StringBuilder(normalized), matches, limit);
        return List.copyOf(matches);
    }

    public boolean remove(String term) { return remove(root, normalize(term), 0); }

    private boolean remove(Node node, String term, int position) {
        if (position == term.length()) {
            if (!node.terminal) return false;
            node.terminal = false;
            return true;
        }
        char ch = term.charAt(position);
        Node child = node.children.get(ch);
        if (child == null || !remove(child, term, position + 1)) return false;
        if (!child.terminal && child.children.isEmpty()) node.children.remove(ch);
        return true;
    }

    private static void collect(Node node, StringBuilder word, List<String> output, int limit) {
        if (output.size() >= limit) return;
        if (node.terminal) output.add(word.toString());
        for (var entry : node.children.entrySet()) {
            if (output.size() >= limit) break;
            word.append(entry.getKey());
            collect(entry.getValue(), word, output, limit);
            word.setLength(word.length() - 1);
        }
    }

    private static String normalize(String value) {
        if (value == null) throw new IllegalArgumentException("term cannot be null");
        return value.strip().toLowerCase(Locale.ROOT);
    }
}
