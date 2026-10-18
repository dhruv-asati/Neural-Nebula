package com.neuralnebula.api;

import com.neuralnebula.api.dto.CreateNoteRequest;
import com.neuralnebula.api.dto.NoteResponse;
import com.neuralnebula.api.dto.UpdateNoteRequest;
import com.neuralnebula.service.KnowledgeService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/notes")
public final class NoteController {
    private final KnowledgeService knowledge;

    public NoteController(KnowledgeService knowledge) { this.knowledge = knowledge; }

    @GetMapping
    public List<NoteResponse> list() { return knowledge.listNotes().stream().map(NoteResponse::from).toList(); }

    @PostMapping
    public ResponseEntity<NoteResponse> create(@Valid @RequestBody CreateNoteRequest request) {
        NoteResponse response = NoteResponse.from(knowledge.createNote(request.title(), request.content(),
                request.tags(), request.type(), request.importance()));
        return ResponseEntity.created(URI.create("/api/notes/" + response.id())).body(response);
    }

    @GetMapping("/{id}")
    public NoteResponse get(@PathVariable String id) { return NoteResponse.from(knowledge.getNote(id)); }

    @PutMapping("/{id}")
    public NoteResponse update(@PathVariable String id, @Valid @RequestBody UpdateNoteRequest request) {
        return NoteResponse.from(knowledge.updateNote(id, request.title(), request.content(), request.tags(),
                request.type(), request.importance()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        knowledge.deleteNote(id);
        return ResponseEntity.noContent().build();
    }
}
