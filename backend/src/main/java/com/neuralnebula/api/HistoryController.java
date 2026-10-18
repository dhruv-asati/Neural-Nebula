package com.neuralnebula.api;

import com.neuralnebula.service.KnowledgeService;
import com.neuralnebula.service.KnowledgeService.HistoryOperation;
import com.neuralnebula.service.KnowledgeService.HistoryStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/history")
public final class HistoryController {
    private final KnowledgeService knowledge;

    public HistoryController(KnowledgeService knowledge) { this.knowledge = knowledge; }

    @GetMapping
    public HistoryStatus status() { return knowledge.historyStatus(); }

    @PostMapping("/undo")
    public HistoryOperation undo() { return knowledge.undo(); }

    @PostMapping("/redo")
    public HistoryOperation redo() { return knowledge.redo(); }
}
