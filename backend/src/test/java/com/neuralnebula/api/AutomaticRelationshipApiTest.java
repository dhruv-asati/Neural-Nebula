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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class AutomaticRelationshipApiTest {
    private static final Path DATA_FILE;

    static {
        try { DATA_FILE = Files.createTempDirectory("neural-nebula-auto-link-api").resolve("knowledge.json"); }
        catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("neuralnebula.storage.path", () -> DATA_FILE.toString());
        registry.add("neuralnebula.seed-sample-data", () -> false);
    }

    @Autowired MockMvc mvc;

    @Test
    void createAutomaticallyConnectsOnlyHighConfidencePairAndExposesReasonedSuggestions() throws Exception {
        String firstId = createNote("Distributed Graph Algorithms",
                "Traversal explores connected vertices and edges in weighted networks.",
                "graph", "algorithms", "networks");
        String secondId = createNote("Graph Algorithms for Distributed Networks",
                "Traversal explores connected vertices and edges in weighted networks.",
                "graph", "algorithms", "networks");

        mvc.perform(get("/api/graph"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nodes.length()").value(2))
                .andExpect(jsonPath("$.edges.length()").value(1))
                .andExpect(jsonPath("$.edges[0].origin").value("AUTOMATIC"))
                .andExpect(jsonPath("$.edges[0].similarityScore").isNumber());
        mvc.perform(get("/api/relationships/suggestions").param("noteId", firstId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].noteId").value(secondId))
                .andExpect(jsonPath("$[0].reason").isNotEmpty());
    }

    private String createNote(String title, String content, String... tags) throws Exception {
        String tagsJson = java.util.Arrays.stream(tags).map(tag -> "\"" + tag + "\"")
                .collect(java.util.stream.Collectors.joining(","));
        MvcResult result = mvc.perform(post("/api/notes").contentType(APPLICATION_JSON).content("""
                        {"title":"%s","content":"%s","tags":[%s],"type":"CONCEPT","importance":60}
                        """.formatted(title, content, tagsJson)))
                .andExpect(status().isCreated()).andReturn();
        String location = result.getResponse().getHeader("Location");
        return location.substring(location.lastIndexOf('/') + 1);
    }
}
