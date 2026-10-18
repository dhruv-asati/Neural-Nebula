package com.neuralnebula.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class StageFiveApiIntegrationTest {
    private static final Path DATA_FILE;

    static {
        try { DATA_FILE = Files.createTempDirectory("neural-nebula-stage-five-api").resolve("knowledge.json"); }
        catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("neuralnebula.storage.path", () -> DATA_FILE.toString());
        registry.add("neuralnebula.seed-sample-data", () -> true);
    }

    @Autowired MockMvc mvc;

    @Test
    void prerequisiteTopKAndHistoryEndpointsWorkWithExistingKnowledgeApi() throws Exception {
        mvc.perform(get("/api/history"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canUndo").value(false))
                .andExpect(jsonPath("$.canRedo").value(false)).andExpect(jsonPath("$.undoCount").value(0));
        mvc.perform(post("/api/history/undo"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applied").value(false))
                .andExpect(jsonPath("$.message").value("There is nothing to undo"));
        mvc.perform(post("/api/history/redo"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.applied").value(false));

        mvc.perform(get("/api/algorithms/top-k").param("limit", "0"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/algorithms/top-k").param("limit", "-1"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        mvc.perform(get("/api/algorithms/top-k").param("limit", "100"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(20));

        String firstId = createNote("Stage Five A", "alpha learning foundation", 40);
        String secondId = createNote("Stage Five B", "advanced learning topic", 60);
        mvc.perform(post("/api/relationships").contentType(APPLICATION_JSON).content("""
                        {"sourceNoteId":"%s","targetNoteId":"%s","type":"RELATED"}
                        """.formatted(firstId, secondId)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.origin").value("MANUAL"));
        MvcResult link = mvc.perform(post("/api/relationships").contentType(APPLICATION_JSON).content("""
                        {"sourceNoteId":"%s","targetNoteId":"dsa-structures","type":"REFERENCES"}
                        """.formatted(firstId)))
                .andExpect(status().isCreated()).andReturn();
        String relationshipId = link.getResponse().getHeader("Location").substring(
                link.getResponse().getHeader("Location").lastIndexOf('/') + 1);
        mvc.perform(post("/api/relationships").contentType(APPLICATION_JSON).content("""
                        {"sourceNoteId":"%s","targetNoteId":"%s","type":"RELATED"}
                        """.formatted(secondId, firstId)))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/prerequisites").contentType(APPLICATION_JSON).content("""
                        {"prerequisiteNoteId":"%s","dependentNoteId":"%s"}
                        """.formatted(firstId, secondId)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.prerequisiteNoteId").value(firstId))
                .andExpect(jsonPath("$.dependentNoteId").value(secondId));
        mvc.perform(post("/api/prerequisites").contentType(APPLICATION_JSON).content("""
                        {"prerequisiteNoteId":"%s","dependentNoteId":"%s"}
                        """.formatted(firstId, secondId)))
                .andExpect(status().isConflict());
        mvc.perform(post("/api/prerequisites").contentType(APPLICATION_JSON).content("""
                        {"prerequisiteNoteId":"%s","dependentNoteId":"%s"}
                        """.formatted(firstId, firstId)))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/prerequisites").contentType(APPLICATION_JSON).content("""
                        {"prerequisiteNoteId":"missing","dependentNoteId":"%s"}
                        """.formatted(secondId)))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/prerequisites")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/graph")).andExpect(status().isOk())
                .andExpect(jsonPath("$.edges.length()").value(22));

        mvc.perform(delete("/api/prerequisites/{first}/{second}", firstId, secondId))
                .andExpect(status().isNoContent());
        mvc.perform(post("/api/history/undo")).andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(true));
        mvc.perform(get("/api/prerequisites")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(post("/api/history/redo")).andExpect(status().isOk())
                .andExpect(jsonPath("$.applied").value(true));
        mvc.perform(get("/api/prerequisites")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(post("/api/history/undo")).andExpect(status().isOk()); // Restore the prerequisite for note deletion.

        mvc.perform(delete("/api/relationships/{id}", relationshipId)).andExpect(status().isNoContent());
        mvc.perform(post("/api/history/undo")).andExpect(status().isOk());
        mvc.perform(get("/api/graph")).andExpect(status().isOk()).andExpect(jsonPath("$.edges.length()").value(22));

        mvc.perform(put("/api/notes/{id}", firstId).contentType(APPLICATION_JSON).content("""
                        {"title":"Stage Five A","content":"alpha learning foundation","tags":["test"],"type":"CONCEPT","importance":100}
                        """))
                .andExpect(status().isOk()).andExpect(jsonPath("$.importance").value(100));
        mvc.perform(get("/api/algorithms/top-k").param("limit", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(firstId));

        mvc.perform(delete("/api/notes/{id}", firstId)).andExpect(status().isNoContent());
        mvc.perform(get("/api/notes/{id}", firstId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/prerequisites")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get("/api/graph")).andExpect(status().isOk()).andExpect(jsonPath("$.edges.length()").value(20));
        mvc.perform(post("/api/history/undo")).andExpect(status().isOk()).andExpect(jsonPath("$.applied").value(true));
        mvc.perform(get("/api/notes/{id}", firstId)).andExpect(status().isOk());
        mvc.perform(get("/api/prerequisites")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get("/api/graph")).andExpect(status().isOk()).andExpect(jsonPath("$.edges.length()").value(22));

        mvc.perform(post("/api/notes").contentType(APPLICATION_JSON).content("""
                        {"title":"Branch mutation","content":"clear redo","tags":[],"type":"QUESTION","importance":1}
                        """))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/history")).andExpect(status().isOk()).andExpect(jsonPath("$.canRedo").value(false));
    }

    private String createNote(String title, String content, int importance) throws Exception {
        MvcResult created = mvc.perform(post("/api/notes").contentType(APPLICATION_JSON).content("""
                        {"title":"%s","content":"%s","tags":["test"],"type":"CONCEPT","importance":%d}
                        """.formatted(title, content, importance)))
                .andExpect(status().isCreated()).andReturn();
        String location = created.getResponse().getHeader("Location");
        return location.substring(location.lastIndexOf('/') + 1);
    }
}
