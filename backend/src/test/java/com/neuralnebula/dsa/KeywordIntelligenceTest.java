package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class KeywordIntelligenceTest {
    private Note note(String id, String title, String content, String... tags) {
        return new Note(id, title, content, Set.of(tags), NoteType.CONCEPT, 50, Instant.EPOCH, Instant.EPOCH);
    }

    @Test
    void normalizationIsCasePunctuationAndDuplicateSafeAndRemovesStopWords() {
        KeywordNormalizer normalizer = new KeywordNormalizer();
        assertEquals(Set.of("graph", "neural", "nebula", "42"),
                normalizer.normalize("The GRAPH, neural-nebula graph! 42"));
        assertTrue(normalizer.normalize("the and OF").isEmpty());
        assertTrue(normalizer.normalize("").isEmpty());
    }

    @Test
    void invertedIndexSupportsAndOrAndEfficientUpdateCleanup() {
        KeywordIndex index = new KeywordIndex(new KeywordNormalizer());
        index.index(note("a", "Graph theory", "edges", "algorithms"));
        index.index(note("b", "Graph traversal", "trees"));
        index.index(note("c", "Nebula", "stars"));
        assertEquals(java.util.List.of("a", "b"), index.search("graph", KeywordIndex.MatchMode.OR));
        assertEquals(java.util.List.of("a"), index.search("graph edges", KeywordIndex.MatchMode.AND));
        assertEquals(java.util.List.of("a", "b", "c"), index.search("graph nebula", KeywordIndex.MatchMode.OR));
        assertTrue(index.findByKeyword("unknown").isEmpty());
        index.update(note("a", "Cosmos", "stars"));
        assertTrue(index.search("graph", KeywordIndex.MatchMode.OR).contains("b"));
        assertFalse(index.search("graph", KeywordIndex.MatchMode.OR).contains("a"));
        index.remove("b");
        assertEquals(java.util.List.of(), index.search("graph", KeywordIndex.MatchMode.OR));
    }

    @Test
    void jaccardHandlesBoundariesAndSuggestionsAreRankedAndExcludeSelf() {
        SimilarityService similarity = new SimilarityService();
        assertEquals(1.0, similarity.jaccard(Set.of("a", "b"), Set.of("a", "b")));
        assertEquals(1.0, similarity.jaccard(Set.of(), Set.of()));
        assertEquals(0.0, similarity.jaccard(Set.of(), Set.of("x")));
        assertEquals(0.5, similarity.jaccard(Set.of("a", "b"), Set.of("a")));
        assertEquals(0.0, similarity.jaccard(Set.of("a"), Set.of("b")));

        KeywordIndex index = new KeywordIndex(new KeywordNormalizer());
        index.index(note("a", "red blue", ""));
        index.index(note("b", "red blue", ""));
        index.index(note("c", "red green", ""));
        index.index(note("d", "unrelated", ""));
        assertEquals(java.util.List.of(new SimilarityService.Suggestion("b", 1.0),
                        new SimilarityService.Suggestion("c", 1.0 / 3)),
                similarity.suggest("a", index, 0.3));
    }

    @Test
    void trieSupportsNormalizedPrefixRemovalDeduplicationAndLimits() {
        AutocompleteTrie trie = new AutocompleteTrie();
        trie.insert("Graph"); trie.insert("grapheme"); trie.insert("graph"); trie.insert("gravity");
        assertEquals(java.util.List.of("graph", "grapheme", "gravity"), trie.searchByPrefix("GR", 10));
        assertEquals(java.util.List.of("graph", "grapheme"), trie.searchByPrefix("gr", 2));
        assertTrue(trie.remove("GRAPH"));
        assertEquals(java.util.List.of("grapheme", "gravity"), trie.searchByPrefix("gr", 10));
        assertFalse(trie.remove("missing"));
        assertEquals(java.util.List.of(), trie.searchByPrefix("gr", 0));
    }

    @Test
    void editDistanceSupportsOperationsEmptyInputsAndBoundedSuggestions() {
        EditDistance distance = new EditDistance();
        assertEquals(0, distance.distance("same", "same"));
        assertEquals(3, distance.distance("", "abc"));
        assertEquals(3, distance.distance("kitten", "sitting"));
        assertEquals(1, distance.distance("cat", "cut"));
        assertEquals(2, distance.distance("book", "back", 2));
        assertEquals(3, distance.distance("kitten", "sitting", 2));
        assertEquals(java.util.List.of(new EditDistance.Correction("bat", 1),
                        new EditDistance.Correction("cat", 1)),
                distance.corrections("dat", java.util.List.of("bat", "cat", "zebra"), 1));
        KeywordIndex index = new KeywordIndex(new KeywordNormalizer());
        index.index(note("g", "Graph theory", ""));
        assertEquals(java.util.List.of(new EditDistance.Correction("graph", 1)),
                distance.suggestCorrections("GRPH!", index, 1));
    }

    @Test
    void knowledgeBaseKeepsIndexAlignedAcrossCreateUpdateDelete() {
        KnowledgeBase base = new KnowledgeBase();
        base.register(note("a", "Graph", "edges"));
        base.register(note("b", "Graph rendering", "three dimensional"));
        assertEquals(java.util.List.of("a", "b"), base.keywordIndex().search("graph", KeywordIndex.MatchMode.AND));
        assertTrue(base.autocompleteTrie().searchByPrefix("gra", 10).contains("graph"));
        base.update(note("a", "Nebula", "stars"));
        assertEquals(java.util.List.of("b"), base.keywordIndex().search("graph", KeywordIndex.MatchMode.AND));
        assertEquals("Nebula", base.findById("a").orElseThrow().title());
        assertTrue(base.autocompleteTrie().searchByPrefix("neb", 10).contains("nebula"));
        assertTrue(base.autocompleteTrie().searchByPrefix("gra", 10).contains("graph")); // Still used by b.
        base.remove("a");
        assertTrue(base.keywordIndex().search("nebula", KeywordIndex.MatchMode.AND).isEmpty());
        assertFalse(base.autocompleteTrie().searchByPrefix("neb", 10).contains("nebula"));
    }
}
