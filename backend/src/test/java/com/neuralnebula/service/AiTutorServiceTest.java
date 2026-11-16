package com.neuralnebula.service;

import com.neuralnebula.ai.TutorModelGateway;
import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteRelationship;
import com.neuralnebula.domain.NoteType;
import com.neuralnebula.domain.RelationshipOrigin;
import com.neuralnebula.domain.RelationshipType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiTutorServiceTest {
    @Test
    void buildsContextFromSelectedNoteAndOnlyDirectStoredRelationshipsAndLimitsHistory() {
        KnowledgeService knowledge = mock(KnowledgeService.class);
        TutorModelGateway model = mock(TutorModelGateway.class);
        Note topic = note("topic", "Gradient Descent", "Actual note content", 80);
        Note direct = note("direct", "Learning Rate", "Direct summary", 40);
        Note indirect = note("indirect", "Hidden Neighbor", "Must not be included", 30);
        when(knowledge.graph()).thenReturn(new KnowledgeService.GraphData(List.of(topic, direct, indirect), List.of(
                relationship("topic", "direct"), relationship("direct", "indirect"))));
        when(model.generate(anyString(), anyString())).thenReturn("Tutor answer");
        AiTutorService service = new AiTutorService(knowledge, model);
        List<com.neuralnebula.api.dto.AiChatRequest.HistoryTurn> history = java.util.stream.IntStream.range(0, 12)
                .mapToObj(i -> new com.neuralnebula.api.dto.AiChatRequest.HistoryTurn("USER", "turn-" + i)).toList();

        service.chat(new com.neuralnebula.api.dto.AiChatRequest("topic", "Explain it", history));

        var prompt = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(model).generate(anyString(), prompt.capture());
        org.junit.jupiter.api.Assertions.assertTrue(prompt.getValue().contains("Actual note content"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.getValue().contains("Learning Rate"));
        org.junit.jupiter.api.Assertions.assertFalse(prompt.getValue().contains("Must not be included"));
        org.junit.jupiter.api.Assertions.assertFalse(prompt.getValue().contains("turn-1\n"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.getValue().contains("turn-2\n"));
        org.junit.jupiter.api.Assertions.assertTrue(prompt.getValue().contains("turn-11\n"));
    }

    @Test
    void unknownNoteIsNotSentToModel() {
        KnowledgeService knowledge = mock(KnowledgeService.class);
        TutorModelGateway model = mock(TutorModelGateway.class);
        when(knowledge.graph()).thenReturn(new KnowledgeService.GraphData(List.of(), List.of()));
        AiTutorService service = new AiTutorService(knowledge, model);
        assertThrows(ApiNotFoundException.class, () -> service.chat(
                new com.neuralnebula.api.dto.AiChatRequest("missing", "question", List.of())));
        org.mockito.Mockito.verifyNoInteractions(model);
    }

    private static Note note(String id, String title, String content, int importance) {
        Instant now = Instant.now();
        return new Note(id, title, content, Set.of("graphs", "learning"), NoteType.CONCEPT, importance, now, now);
    }

    private static NoteRelationship relationship(String from, String to) {
        return new NoteRelationship(from + "-" + to, from, to, RelationshipType.RELATED, RelationshipOrigin.MANUAL, null);
    }
}
