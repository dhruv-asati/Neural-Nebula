package com.neuralnebula.api;

import com.neuralnebula.api.dto.NoteResponse;
import com.neuralnebula.api.dto.SearchResponse;
import com.neuralnebula.api.dto.SearchSuggestionsResponse;
import com.neuralnebula.service.KnowledgeService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
public final class SearchController {
    private final KnowledgeService knowledge;

    public SearchController(KnowledgeService knowledge) { this.knowledge = knowledge; }

    @GetMapping
    public SearchResponse search(@RequestParam String q) {
        return new SearchResponse("AND", knowledge.search(q).stream().map(NoteResponse::from).toList());
    }

    @GetMapping("/suggestions")
    public SearchSuggestionsResponse suggestions(@RequestParam String q,
                                                 @RequestParam(defaultValue = "10") int limit) {
        var result = knowledge.suggestions(q, limit);
        return new SearchSuggestionsResponse(result.autocomplete(), result.corrections());
    }
}
