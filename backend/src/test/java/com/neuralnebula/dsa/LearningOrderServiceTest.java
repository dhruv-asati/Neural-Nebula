package com.neuralnebula.dsa;

import com.neuralnebula.domain.PrerequisiteDependency;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class LearningOrderServiceTest {
    private final LearningOrderService service = new LearningOrderService();

    @Test
    void emptyPrerequisiteGraphUsesAscendingIdsForIndependentNotes() {
        var result = service.compute(List.of("c", "a", "b"), List.of());
        assertTrue(result.possible());
        assertEquals(List.of("a", "b", "c"), result.learningOrder());
        assertTrue(result.blockedNoteIds().isEmpty());
    }

    @Test
    void validChainPlacesPrerequisitesFirstAndBreaksReadyTiesById() {
        var result = service.compute(List.of("d", "c", "b", "a", "z"), List.of(
                new PrerequisiteDependency("b", "d"), new PrerequisiteDependency("a", "b")));
        assertTrue(result.possible());
        assertEquals(List.of("a", "b", "c", "d", "z"), result.learningOrder());
    }

    @Test
    void multiNoteCycleIsDetectedAndReportsBlockedNotes() {
        var result = service.compute(List.of("a", "b", "c", "independent"), List.of(
                new PrerequisiteDependency("a", "b"), new PrerequisiteDependency("b", "c"),
                new PrerequisiteDependency("c", "a")));
        assertFalse(result.possible());
        assertEquals(List.of("independent"), result.learningOrder());
        assertEquals(List.of("a", "b", "c"), result.blockedNoteIds());
    }

    @Test
    void rejectsMissingReferencesAndDuplicateNoteIds() {
        assertThrows(IllegalArgumentException.class, () -> service.compute(List.of("a"),
                List.of(new PrerequisiteDependency("a", "missing"))));
        assertThrows(IllegalArgumentException.class, () -> service.compute(List.of("a", "a"), List.of()));
    }
}
