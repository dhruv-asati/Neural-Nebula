package com.neuralnebula.dsa;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/** Disjoint-set forest with path compression and union by rank (amortized near-constant operations). */
public final class UnionFind {
    private final Map<String, String> parent = new HashMap<>();
    private final Map<String, Integer> rank = new HashMap<>();
    private int componentCount;
    private int findOperations;

    public UnionFind(Collection<String> elements) {
        for (String element : elements) {
            Objects.requireNonNull(element);
            if (parent.putIfAbsent(element, element) == null) {
                rank.put(element, 0);
                componentCount++;
            }
        }
    }

    public String find(String element) {
        if (!parent.containsKey(element)) throw new IllegalArgumentException("unknown element: " + element);
        findOperations++;
        String directParent = parent.get(element);
        if (!directParent.equals(element)) parent.put(element, find(parent.get(element)));
        return parent.get(element);
    }

    /** Returns true only when two previously separate components were merged. */
    public boolean union(String first, String second) {
        String firstRoot = find(first), secondRoot = find(second);
        if (firstRoot.equals(secondRoot)) return false;
        int firstRank = rank.get(firstRoot), secondRank = rank.get(secondRoot);
        if (firstRank < secondRank) parent.put(firstRoot, secondRoot);
        else if (firstRank > secondRank) parent.put(secondRoot, firstRoot);
        else {
            parent.put(secondRoot, firstRoot);
            rank.put(firstRoot, firstRank + 1);
        }
        componentCount--;
        return true;
    }

    public int componentCount() { return componentCount; }
    public int findOperationCount() { return findOperations; }
}
