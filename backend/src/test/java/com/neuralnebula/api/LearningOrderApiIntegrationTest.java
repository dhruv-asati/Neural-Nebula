package com.neuralnebula.api;

import com.neuralnebula.domain.Note;
import com.neuralnebula.domain.NoteType;
import com.neuralnebula.service.KnowledgeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class LearningOrderApiIntegrationTest {
    private static final Path DATA_FILE;
    static {
        try { DATA_FILE = Files.createTempDirectory("neural-nebula-learning-order-api").resolve("knowledge.json"); }
        catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("neuralnebula.storage.path", () -> DATA_FILE.toString());
        registry.add("neuralnebula.seed-sample-data", () -> false);
    }

    @Autowired MockMvc mvc;
    @Autowired KnowledgeService knowledge;

    @Test
    void endpointReturnsPrerequisiteFirstDeterministicOrderAndCycleDetails() throws Exception {
        Note alpha = note("alpha"), beta = note("beta"), gamma = note("gamma"), independent = note("independent");
        knowledge.createPrerequisite(alpha.id(), gamma.id());
        knowledge.createPrerequisite(beta.id(), gamma.id());
        List<String> expectedOrder = expectedKahnOrder(alpha.id(), beta.id(), gamma.id(), independent.id());

        mvc.perform(get("/api/algorithms/learning-order"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.possible").value(true))
                .andExpect(jsonPath("$.learningOrder").value(expectedOrder));

        knowledge.createPrerequisite(gamma.id(), alpha.id());
        mvc.perform(get("/api/algorithms/learning-order"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.possible").value(false))
                .andExpect(jsonPath("$.blockedNoteIds.length()").value(2))
                .andExpect(jsonPath("$.learningOrder.length()").value(2));
    }

    private Note note(String title) {
        return knowledge.createNote(title, title, Set.of(), NoteType.CONCEPT, 50);
    }

    private List<String> expectedKahnOrder(String alphaId, String betaId, String gammaId, String independentId) {
        List<String> remaining = new ArrayList<>(List.of(alphaId, betaId, gammaId, independentId));
        List<String> order = new ArrayList<>();
        while (!remaining.isEmpty()) {
            boolean prerequisitesComplete = !remaining.contains(alphaId) && !remaining.contains(betaId);
            String next = remaining.stream()
                    .filter(id -> !id.equals(gammaId) || prerequisitesComplete)
                    .min(String::compareTo)
                    .orElseThrow();
            order.add(next);
            remaining.remove(next);
        }
        return order;
    }
}
