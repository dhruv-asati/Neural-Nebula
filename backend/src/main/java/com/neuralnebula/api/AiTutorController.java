package com.neuralnebula.api;

import com.neuralnebula.api.dto.AiChatRequest;
import com.neuralnebula.api.dto.AiChatResponse;
import com.neuralnebula.service.AiTutorService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public final class AiTutorController {
    private final AiTutorService tutor;

    public AiTutorController(AiTutorService tutor) { this.tutor = tutor; }

    @PostMapping("/chat")
    public AiChatResponse chat(@Valid @RequestBody AiChatRequest request) {
        return new AiChatResponse(tutor.chat(request));
    }
}
