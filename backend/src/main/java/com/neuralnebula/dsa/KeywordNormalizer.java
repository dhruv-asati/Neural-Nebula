package com.neuralnebula.dsa;

import com.neuralnebula.domain.Note;

import java.util.Locale;
import java.util.Collections;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Extracts unique, lowercase Unicode letter/digit tokens in deterministic order. */
public final class KeywordNormalizer {
    private static final Pattern TOKEN = Pattern.compile("[\\p{L}\\p{N}]+");
    private static final Set<String> STOP_WORDS = Set.of(
            "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
            "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "with");

    /** Empty text and text containing only stop words produce an empty set. */
    public Set<String> normalize(String text) {
        TreeSet<String> result = new TreeSet<>();
        if (text == null || text.isBlank()) return Set.of();
        Matcher matcher = TOKEN.matcher(text.toLowerCase(Locale.ROOT));
        while (matcher.find()) {
            String token = matcher.group();
            if (!STOP_WORDS.contains(token)) result.add(token);
        }
        return Collections.unmodifiableSet(result);
    }

    /** Combines title, content, and tags before normalization; duplicate terms occur once. */
    public Set<String> normalize(Note note) {
        StringBuilder text = new StringBuilder(note.title()).append(' ').append(note.content());
        note.tags().stream().sorted().forEach(tag -> text.append(' ').append(tag));
        return normalize(text.toString());
    }
}
