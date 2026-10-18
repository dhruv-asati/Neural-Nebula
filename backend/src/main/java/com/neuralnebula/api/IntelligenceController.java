package com.neuralnebula.api;

import com.neuralnebula.dsa.SimilarityService;
import com.neuralnebula.dsa.ConnectedComponentsService;
import com.neuralnebula.dsa.ShortestPathService;
import com.neuralnebula.dsa.CommunityDetectionService;
import com.neuralnebula.dsa.GraphTraversal;
import com.neuralnebula.api.dto.NoteResponse;
import com.neuralnebula.api.dto.LearningOrderResponse;
import com.neuralnebula.service.KnowledgeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public final class IntelligenceController {
    private final KnowledgeService knowledge;

    public IntelligenceController(KnowledgeService knowledge) { this.knowledge = knowledge; }

    @GetMapping("/relationships/suggestions")
    public List<SimilarityService.Suggestion> relationshipSuggestions(
            @RequestParam String noteId, @RequestParam(defaultValue = "0.1") double threshold) {
        return knowledge.relationshipSuggestions(noteId, threshold);
    }

    @GetMapping("/algorithms/components")
    public ConnectedComponentsService.Result components() { return knowledge.connectedComponents(); }

    @GetMapping("/algorithms/path")
    public ShortestPathService.Result shortestPath(@RequestParam("from") String from, @RequestParam("to") String to) {
        return knowledge.shortestPath(from, to);
    }

    @GetMapping("/algorithms/communities")
    public CommunityDetectionService.Result communities() { return knowledge.topicCommunities(); }

    @GetMapping("/algorithms/learning-order")
    public LearningOrderResponse learningOrder() {
        var result = knowledge.learningOrder();
        return new LearningOrderResponse(result.algorithm(), result.possible(), result.learningOrder(),
                result.blockedNoteIds(), result.prerequisiteCount());
    }

    @GetMapping("/algorithms/dfs")
    public GraphTraversal.Result depthFirst(@RequestParam String start) { return knowledge.depthFirst(start); }

    @GetMapping("/algorithms/top-k")
    public List<NoteResponse> topKImportantNotes(@RequestParam(defaultValue = "10") int limit) {
        return knowledge.topKImportantNotes(limit).stream().map(NoteResponse::from).toList();
    }
}
