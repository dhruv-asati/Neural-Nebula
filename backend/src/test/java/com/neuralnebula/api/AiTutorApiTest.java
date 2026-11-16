package com.neuralnebula.api;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import com.neuralnebula.domain.NoteType;
import com.neuralnebula.service.KnowledgeService;
import java.util.Set;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AiTutorApiTest {
    private static final Path DATA_FILE;
    static {
        try { DATA_FILE = Files.createTempDirectory("neural-nebula-ai-api").resolve("knowledge.json"); }
        catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }
    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("neuralnebula.storage.path", () -> DATA_FILE.toString());
        registry.add("neuralnebula.seed-sample-data", () -> false);
        registry.add("nvidia.api-key", () -> "");
    }

    @Autowired MockMvc mvc;
    @Autowired KnowledgeService knowledge;

    @BeforeEach
    void ensureNoteExists() {
        if (knowledge.listNotes().isEmpty()) knowledge.createNote("Test topic", "Stored test context", Set.of("test"), NoteType.CONCEPT, 50);
    }

    @Test
    void invalidRequestIsRejectedBeforeTutorRuns() throws Exception {
        mvc.perform(post("/api/ai/chat").contentType(APPLICATION_JSON)
                        .content("{\"noteId\":\"\",\"message\":\"\",\"history\":[]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
    }

    @Test
    void missingNvidiaApiKeyReturnsHelpfulServiceUnavailableResponse() throws Exception {
        String noteId = knowledge.listNotes().getFirst().id();
        String payload = "{\"noteId\":\"%s\",\"message\":\"Explain it\",\"history\":[]}".formatted(noteId);
        mvc.perform(post("/api/ai/chat").contentType(APPLICATION_JSON).content(payload))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AI_TUTOR_NOT_CONFIGURED"))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("NVIDIA_API_KEY")));
    }
}
