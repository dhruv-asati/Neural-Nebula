package com.neuralnebula.api;

import com.neuralnebula.api.dto.CreatePrerequisiteRequest;
import com.neuralnebula.api.dto.PrerequisiteResponse;
import com.neuralnebula.service.KnowledgeService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/prerequisites")
public final class PrerequisiteController {
    private final KnowledgeService knowledge;

    public PrerequisiteController(KnowledgeService knowledge) { this.knowledge = knowledge; }

    @GetMapping
    public List<PrerequisiteResponse> list() {
        return knowledge.listPrerequisites().stream().map(PrerequisiteResponse::from).toList();
    }

    @PostMapping
    public ResponseEntity<PrerequisiteResponse> create(@Valid @RequestBody CreatePrerequisiteRequest request) {
        PrerequisiteResponse response = PrerequisiteResponse.from(knowledge.createPrerequisite(
                request.prerequisiteNoteId(), request.dependentNoteId()));
        URI location = URI.create("/api/prerequisites/" + response.prerequisiteNoteId() + "/" + response.dependentNoteId());
        return ResponseEntity.created(location).body(response);
    }

    @DeleteMapping("/{prerequisiteNoteId}/{dependentNoteId}")
    public ResponseEntity<Void> delete(@PathVariable String prerequisiteNoteId,
                                       @PathVariable String dependentNoteId) {
        knowledge.deletePrerequisite(prerequisiteNoteId, dependentNoteId);
        return ResponseEntity.noContent().build();
    }
}
