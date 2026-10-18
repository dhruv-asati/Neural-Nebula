package com.neuralnebula.api.dto;

import java.util.List;

public record GraphResponse(List<NoteResponse> nodes, List<RelationshipResponse> edges) { }
