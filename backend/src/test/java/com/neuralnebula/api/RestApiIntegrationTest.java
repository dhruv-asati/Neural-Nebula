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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class RestApiIntegrationTest {
    private static final Path DATA_FILE;

    static {
        try { DATA_FILE = Files.createTempDirectory("neural-nebula-http-test").resolve("knowledge.json"); }
        catch (Exception exception) { throw new ExceptionInInitializerError(exception); }
    }

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("neuralnebula.storage.path", () -> DATA_FILE.toString());
        registry.add("neuralnebula.seed-sample-data", () -> true);
    }

    @Autowired MockMvc mvc;

    @Test
    void notesRelationshipsSearchAndStageTwoAlgorithmsWorkOverHttp() throws Exception {
        mvc.perform(get("/api/notes"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(20));
        mvc.perform(get("/api/graph"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.nodes.length()").value(20))
                .andExpect(jsonPath("$.edges.length()").value(20));
        mvc.perform(get("/api/search").param("q", "graph"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.matchMode").value("AND"))
                .andExpect(jsonPath("$.results.length()").isNumber());
        mvc.perform(get("/api/search/suggestions").param("q", "grph"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.corrections[0].term").value("graph"));
        mvc.perform(get("/api/relationships/suggestions").param("noteId", "graph-theory"))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].similarity").isNumber());
        mvc.perform(get("/api/algorithms/components"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.algorithm").value("Union-Find"));
        mvc.perform(get("/api/algorithms/path").param("from", "dsa-structures").param("to", "union-find"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.pathExists").value(true));
        mvc.perform(get("/api/algorithms/communities"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.algorithm").value("Weighted Label Propagation"));
        mvc.perform(get("/api/algorithms/dfs").param("start", "graph-theory"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.algorithm").value("DFS"));

        mvc.perform(get("/api/algorithms/top-k").param("limit", "5"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[0].id").value("neural-networks"))
                .andExpect(jsonPath("$[0].importance").value(96));
        mvc.perform(get("/api/search").param("q", "   "))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        mvc.perform(get("/api/notes/missing-note"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mvc.perform(post("/api/notes").contentType("application/json")
                        .content("{\"title\":\"\",\"content\":\"\",\"tags\":[],\"type\":\"CONCEPT\",\"importance\":101}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("BAD_REQUEST"));
        mvc.perform(get("/api/relationships/suggestions").param("noteId", "missing-note"))
                .andExpect(status().isNotFound());

        String createBody = """
                {"title":"HTTP Created Note","content":"A note created over the REST API","tags":["http","api"],"type":"CONCEPT","importance":70}
                """;
        MvcResult created = mvc.perform(post("/api/notes").contentType("application/json").content(createBody))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("HTTP Created Note"))
                .andReturn();
        String createdId = created.getResponse().getHeader("Location").substring(
                created.getResponse().getHeader("Location").lastIndexOf('/') + 1);
        mvc.perform(get("/api/notes/" + createdId)).andExpect(status().isOk());

        String updateBody = """
                {"title":"HTTP Updated Note","content":"Updated content","tags":["update"],"type":"SUMMARY","importance":75}
                """;
        mvc.perform(put("/api/notes/" + createdId).contentType("application/json").content(updateBody))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("HTTP Updated Note"));

        String relationshipBody = """
                {"sourceNoteId":"research-question","targetNoteId":"software-design","type":"RELATED"}
                """;
        MvcResult linked = mvc.perform(post("/api/relationships").contentType("application/json").content(relationshipBody))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.origin").value("MANUAL")).andReturn();
        String relationshipId = linked.getResponse().getHeader("Location").substring(
                linked.getResponse().getHeader("Location").lastIndexOf('/') + 1);
        mvc.perform(post("/api/relationships").contentType("application/json").content(relationshipBody))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("CONFLICT"));
        mvc.perform(delete("/api/relationships/" + relationshipId)).andExpect(status().isNoContent());

        // Recreate a link, then delete its note and verify the ordinary relationship is cleaned up.
        mvc.perform(post("/api/relationships").contentType("application/json").content(relationshipBody))
                .andExpect(status().isCreated());
        mvc.perform(delete("/api/notes/research-question")).andExpect(status().isNoContent());
        mvc.perform(get("/api/graph")).andExpect(status().isOk())
                .andExpect(jsonPath("$.nodes.length()").value(20))
                .andExpect(jsonPath("$.edges.length()").value(20));
        mvc.perform(delete("/api/notes/" + createdId)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/notes/" + createdId)).andExpect(status().isNotFound());
    }
}
