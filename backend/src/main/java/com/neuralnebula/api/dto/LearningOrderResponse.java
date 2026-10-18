package com.neuralnebula.api.dto;

import java.util.List;

public record LearningOrderResponse(String algorithm, boolean possible, List<String> learningOrder,
                                    List<String> blockedNoteIds, int prerequisiteCount) { }
