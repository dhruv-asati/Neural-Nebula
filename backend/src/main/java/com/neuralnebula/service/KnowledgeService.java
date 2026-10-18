package com.neuralnebula.service;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteRelationship;
import com.neuralnebula.domain.NoteType;
import com.neuralnebula.domain.PrerequisiteDependency;
import com.neuralnebula.domain.RelationshipOrigin;
import com.neuralnebula.domain.RelationshipType;
import com.neuralnebula.dsa.AutocompleteTrie;
import com.neuralnebula.dsa.CommunityDetectionService;
import com.neuralnebula.dsa.ConnectedComponentsService;
import com.neuralnebula.dsa.EditDistance;
import com.neuralnebula.dsa.GraphTraversal;
import com.neuralnebula.dsa.KeywordIndex;
import com.neuralnebula.dsa.LearningOrderService;
import com.neuralnebula.dsa.KnowledgeBase;
import com.neuralnebula.dsa.NoteMaxHeap;
import com.neuralnebula.dsa.ShortestPathService;
import com.neuralnebula.dsa.SimilarityService;
import com.neuralnebula.persistence.JsonFileStore;
import com.neuralnebula.persistence.PersistedData;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Application operations and transactional publication of persisted canonical state. */
@Service
public final class KnowledgeService {
    public record GraphData(List<Note> notes, List<NoteRelationship> relationships) { }
    public record SearchSuggestions(List<String> autocomplete, List<EditDistance.Correction> corrections) { }
    public record HistoryStatus(boolean canUndo, boolean canRedo, int undoCount, int redoCount,
                                String nextUndoAction, String nextRedoAction) { }
    public record HistoryOperation(boolean applied, String action, String message, HistoryStatus history) { }

    private record State(PersistedData data, KnowledgeBase knowledgeBase,
                         Map<String, NoteRelationship> relationships) { }
    private record HistoryEntry(String action, PersistedData before, PersistedData after) { }

    private final JsonFileStore store;
    private final SimilarityService similarity = new SimilarityService();
    private final EditDistance editDistance = new EditDistance();
    private final GraphTraversal traversal = new GraphTraversal();
    private final ShortestPathService shortestPath = new ShortestPathService();
    private final ConnectedComponentsService components = new ConnectedComponentsService();
    private final CommunityDetectionService communities = new CommunityDetectionService();
    private final LearningOrderService learningOrder = new LearningOrderService();
    private final Deque<HistoryEntry> undoStack = new ArrayDeque<>();
    private final Deque<HistoryEntry> redoStack = new ArrayDeque<>();
    private State state;

    public KnowledgeService(JsonFileStore store,
                            @Value("${neuralnebula.seed-sample-data:false}") boolean seedSampleData) {
        this.store = Objects.requireNonNull(store);
        var loaded = store.load();
        if (loaded.isPresent()) {
            state = buildState(loaded.get());
        } else {
            state = buildState(emptyData());
            if (seedSampleData && !store.exists()) {
                State seeded = buildState(new SampleDataFactory().create());
                store.write(seeded.data());
                state = seeded;
            }
        }
    }

    public synchronized List<Note> listNotes() { return state.knowledgeBase().notes(); }

    public synchronized Note getNote(String id) {
        return state.knowledgeBase().findById(id).orElseThrow(() -> new ApiNotFoundException("Note not found"));
    }

    public synchronized Note createNote(String title, String content, Set<String> tags,
                                        NoteType type, int importance) {
        Instant now = Instant.now();
        Note note = new Note(UUID.randomUUID().toString(), title, content, tags, type, importance, now, now);
        List<Note> candidateNotes = new ArrayList<>(state.data().notes());
        candidateNotes.add(note);
        commitMutation(candidate(candidateNotes, state.data().relationships(), state.data().prerequisites()),
                "Create note " + note.id());
        return note;
    }

    public synchronized Note updateNote(String id, String title, String content, Set<String> tags,
                                        NoteType type, int importance) {
        Note existing = getNote(id);
        if (Objects.equals(existing.title(), title) && Objects.equals(existing.content(), content)
                && Objects.equals(existing.tags(), tags) && existing.type() == type
                && existing.importance() == importance) return existing;
        Note updated = new Note(id, title, content, tags, type, importance, existing.createdAt(), Instant.now());
        List<Note> candidateNotes = state.data().notes().stream()
                .map(note -> note.id().equals(id) ? updated : note).toList();
        commitMutation(candidate(candidateNotes, state.data().relationships(), state.data().prerequisites()),
                "Update note " + id);
        return updated;
    }

    public synchronized void deleteNote(String id) {
        getNote(id);
        List<Note> notes = state.data().notes().stream().filter(note -> !note.id().equals(id)).toList();
        List<NoteRelationship> links = state.data().relationships().stream()
                .filter(link -> !link.sourceNoteId().equals(id) && !link.targetNoteId().equals(id)).toList();
        List<PrerequisiteDependency> prerequisites = state.data().prerequisites().stream()
                .filter(dependency -> !dependency.prerequisiteNoteId().equals(id)
                        && !dependency.dependentNoteId().equals(id)).toList();
        commitMutation(candidate(notes, links, prerequisites), "Delete note " + id);
    }

    public synchronized List<NoteRelationship> listRelationships() {
        return state.data().relationships().stream().sorted(Comparator.comparing(NoteRelationship::id)).toList();
    }

    public synchronized NoteRelationship createManualRelationship(String sourceId, String targetId,
                                                                   RelationshipType type) {
        getNote(sourceId); getNote(targetId);
        String edgeKey = edgeKey(sourceId, targetId);
        if (state.data().relationships().stream().anyMatch(link -> edgeKey(link.sourceNoteId(), link.targetNoteId()).equals(edgeKey))) {
            throw new ApiConflictException("A relationship already exists between these notes");
        }
        NoteRelationship relationship = new NoteRelationship(UUID.randomUUID().toString(), sourceId, targetId,
                type, RelationshipOrigin.MANUAL, null);
        List<NoteRelationship> links = new ArrayList<>(state.data().relationships());
        links.add(relationship);
        commitMutation(candidate(state.data().notes(), links, state.data().prerequisites()),
                "Create relationship " + relationship.id());
        return relationship;
    }

    public synchronized void deleteRelationship(String id) {
        if (!state.relationships().containsKey(id)) throw new ApiNotFoundException("Relationship not found");
        List<NoteRelationship> links = state.data().relationships().stream().filter(link -> !link.id().equals(id)).toList();
        commitMutation(candidate(state.data().notes(), links, state.data().prerequisites()),
                "Delete relationship " + id);
    }

    public synchronized List<PrerequisiteDependency> listPrerequisites() {
        return state.data().prerequisites().stream()
                .sorted(Comparator.comparing(PrerequisiteDependency::prerequisiteNoteId)
                        .thenComparing(PrerequisiteDependency::dependentNoteId))
                .toList();
    }

    public synchronized PrerequisiteDependency createPrerequisite(String prerequisiteNoteId, String dependentNoteId) {
        getNote(prerequisiteNoteId);
        getNote(dependentNoteId);
        PrerequisiteDependency dependency = new PrerequisiteDependency(prerequisiteNoteId, dependentNoteId);
        if (state.data().prerequisites().contains(dependency)) {
            throw new ApiConflictException("This prerequisite dependency already exists");
        }
        List<PrerequisiteDependency> prerequisites = new ArrayList<>(state.data().prerequisites());
        prerequisites.add(dependency);
        commitMutation(candidate(state.data().notes(), state.data().relationships(), prerequisites),
                "Create prerequisite " + prerequisiteNoteId + " → " + dependentNoteId);
        return dependency;
    }

    public synchronized void deletePrerequisite(String prerequisiteNoteId, String dependentNoteId) {
        PrerequisiteDependency dependency = new PrerequisiteDependency(prerequisiteNoteId, dependentNoteId);
        if (!state.data().prerequisites().contains(dependency)) {
            throw new ApiNotFoundException("Prerequisite dependency not found");
        }
        List<PrerequisiteDependency> prerequisites = state.data().prerequisites().stream()
                .filter(item -> !item.equals(dependency)).toList();
        commitMutation(candidate(state.data().notes(), state.data().relationships(), prerequisites),
                "Delete prerequisite " + prerequisiteNoteId + " → " + dependentNoteId);
    }

    public synchronized List<Note> search(String query) {
        if (query == null || query.isBlank()) throw new IllegalArgumentException("q must contain a searchable term");
        List<String> ids = state.knowledgeBase().keywordIndex().search(query, KeywordIndex.MatchMode.AND);
        return ids.stream().map(id -> state.knowledgeBase().findById(id).orElseThrow()).toList();
    }

    public synchronized SearchSuggestions suggestions(String query, int limit) {
        if (query == null || query.isBlank()) throw new IllegalArgumentException("q must contain a searchable prefix");
        if (limit < 1 || limit > 50) throw new IllegalArgumentException("limit must be between 1 and 50");
        String prefix = new com.neuralnebula.dsa.KeywordNormalizer().normalize(query).stream().findFirst().orElse("");
        AutocompleteTrie trie = state.knowledgeBase().autocompleteTrie();
        return new SearchSuggestions(trie.searchByPrefix(prefix, limit),
                editDistance.suggestCorrections(query, state.knowledgeBase().keywordIndex(), 2).stream().limit(limit).toList());
    }

    public synchronized GraphData graph() {
        return new GraphData(state.knowledgeBase().notes(), listRelationships());
    }

    public synchronized List<SimilarityService.Suggestion> relationshipSuggestions(String noteId, double threshold) {
        getNote(noteId);
        return similarity.suggest(noteId, state.knowledgeBase().keywordIndex(), threshold);
    }

    public synchronized ConnectedComponentsService.Result connectedComponents() {
        return components.compute(state.knowledgeBase().graph());
    }

    public synchronized ShortestPathService.Result shortestPath(String from, String to) {
        getNote(from); getNote(to);
        return shortestPath.shortestPath(state.knowledgeBase().graph(), from, to);
    }

    public synchronized CommunityDetectionService.Result topicCommunities() {
        return communities.detect(state.knowledgeBase().graph(), state.knowledgeBase().keywordIndex());
    }

    public synchronized LearningOrderService.Result learningOrder() {
        List<String> noteIds = state.knowledgeBase().notes().stream().map(Note::id).toList();
        return learningOrder.compute(noteIds, state.data().prerequisites());
    }

    public synchronized GraphTraversal.Result depthFirst(String start) {
        getNote(start);
        return traversal.depthFirst(state.knowledgeBase().graph(), start);
    }

    public synchronized List<Note> topKImportantNotes(int limit) {
        if (limit < 0) throw new IllegalArgumentException("limit cannot be negative");
        NoteMaxHeap heap = new NoteMaxHeap(state.knowledgeBase().notes());
        List<Note> result = new ArrayList<>(Math.min(limit, heap.size()));
        while (result.size() < limit && !heap.isEmpty()) result.add(heap.removeMax().orElseThrow());
        return List.copyOf(result);
    }

    public synchronized HistoryStatus historyStatus() {
        return new HistoryStatus(!undoStack.isEmpty(), !redoStack.isEmpty(), undoStack.size(), redoStack.size(),
                undoStack.isEmpty() ? null : undoStack.peek().action(),
                redoStack.isEmpty() ? null : redoStack.peek().action());
    }

    public synchronized HistoryOperation undo() {
        if (undoStack.isEmpty()) return new HistoryOperation(false, null, "There is nothing to undo", historyStatus());
        HistoryEntry entry = undoStack.peek();
        State candidate = buildState(entry.before());
        store.write(candidate.data());
        state = candidate;
        undoStack.pop();
        redoStack.push(entry);
        return new HistoryOperation(true, entry.action(), "Undid " + entry.action(), historyStatus());
    }

    public synchronized HistoryOperation redo() {
        if (redoStack.isEmpty()) return new HistoryOperation(false, null, "There is nothing to redo", historyStatus());
        HistoryEntry entry = redoStack.peek();
        State candidate = buildState(entry.after());
        store.write(candidate.data());
        state = candidate;
        redoStack.pop();
        undoStack.push(entry);
        return new HistoryOperation(true, entry.action(), "Redid " + entry.action(), historyStatus());
    }

    private void commitMutation(PersistedData data, String action) {
        State candidate = buildState(data); // Validate and rebuild all derived DSA structures first.
        store.write(candidate.data()); // A failed write leaves the currently published state untouched.
        HistoryEntry entry = new HistoryEntry(action, state.data(), candidate.data());
        state = candidate;
        undoStack.push(entry);
        redoStack.clear();
    }

    private static PersistedData candidate(List<Note> notes, List<NoteRelationship> links,
                                           List<PrerequisiteDependency> prerequisites) {
        return new PersistedData(PersistedData.CURRENT_SCHEMA_VERSION, notes, links, prerequisites);
    }

    private static PersistedData emptyData() {
        return new PersistedData(PersistedData.CURRENT_SCHEMA_VERSION, List.of(), List.of(), List.of());
    }

    private static State buildState(PersistedData data) {
        if (data.schemaVersion() != PersistedData.CURRENT_SCHEMA_VERSION) {
            throw new IllegalStateException("Unsupported knowledge data schema version: " + data.schemaVersion());
        }
        try {
            Map<String, Note> notes = uniqueBy(data.notes(), Note::id, "note ID");
            Map<String, NoteRelationship> relationships = uniqueBy(data.relationships(), NoteRelationship::id, "relationship ID");
            Set<String> seenEdges = new HashSet<>();
            for (NoteRelationship link : relationships.values()) {
                requireReference(notes, link.sourceNoteId(), "relationship source");
                requireReference(notes, link.targetNoteId(), "relationship target");
                if (!seenEdges.add(edgeKey(link.sourceNoteId(), link.targetNoteId()))) {
                    throw new IllegalArgumentException("Duplicate ordinary relationship edge");
                }
            }
            Set<String> seenPrerequisites = new HashSet<>();
            for (PrerequisiteDependency dependency : data.prerequisites()) {
                requireReference(notes, dependency.prerequisiteNoteId(), "prerequisite");
                requireReference(notes, dependency.dependentNoteId(), "dependent note");
                if (!seenPrerequisites.add(dependency.prerequisiteNoteId() + "\u0000" + dependency.dependentNoteId())) {
                    throw new IllegalArgumentException("Duplicate prerequisite dependency");
                }
            }
            KnowledgeBase base = new KnowledgeBase();
            notes.values().stream().sorted(Comparator.comparing(Note::id)).forEach(base::register);
            for (NoteRelationship link : relationships.values()) base.graph().addEdge(link.sourceNoteId(), link.targetNoteId());
            PersistedData normalized = candidate(notes.values().stream().sorted(Comparator.comparing(Note::id)).toList(),
                    relationships.values().stream().sorted(Comparator.comparing(NoteRelationship::id)).toList(),
                    data.prerequisites().stream().sorted(Comparator.comparing(PrerequisiteDependency::prerequisiteNoteId)
                            .thenComparing(PrerequisiteDependency::dependentNoteId)).toList());
            return new State(normalized, base, Map.copyOf(relationships));
        } catch (RuntimeException exception) {
            throw new IllegalStateException("Knowledge data failed validation", exception);
        }
    }

    private static <T> Map<String, T> uniqueBy(List<T> items, Function<T, String> id, String label) {
        return items.stream().collect(Collectors.toMap(id, Function.identity(), (first, second) -> {
            throw new IllegalArgumentException("Duplicate " + label);
        }));
    }

    private static void requireReference(Map<String, Note> notes, String id, String kind) {
        if (!notes.containsKey(id)) throw new IllegalArgumentException("Dangling " + kind + " reference");
    }

    private static String edgeKey(String first, String second) {
        return first.compareTo(second) < 0 ? first + "\u0000" + second : second + "\u0000" + first;
    }
}
