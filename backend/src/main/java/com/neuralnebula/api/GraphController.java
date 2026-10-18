package com.neuralnebula.api;

import com.neuralnebula.api.dto.CreateRelationshipRequest;
import com.neuralnebula.api.dto.GraphResponse;
import com.neuralnebula.api.dto.NoteResponse;
import com.neuralnebula.api.dto.RelationshipResponse;
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

@RestController
@RequestMapping("/api")
public final class GraphController {
    private final KnowledgeService knowledge;

    public GraphController(KnowledgeService knowledge) { this.knowledge = knowledge; }

    @GetMapping("/graph")
    public GraphResponse graph() {
        var graph = knowledge.graph();
        return new GraphResponse(graph.notes().stream().map(NoteResponse::from).toList(),
                graph.relationships().stream().map(RelationshipResponse::from).toList());
    }

    @PostMapping("/relationships")
    public ResponseEntity<RelationshipResponse> create(@Valid @RequestBody CreateRelationshipRequest request) {
        RelationshipResponse response = RelationshipResponse.from(knowledge.createManualRelationship(
                request.sourceNoteId(), request.targetNoteId(), request.type()));
        return ResponseEntity.created(URI.create("/api/relationships/" + response.id())).body(response);
    }

    @DeleteMapping("/relationships/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        knowledge.deleteRelationship(id);
        return ResponseEntity.noContent().build();
    }
}
