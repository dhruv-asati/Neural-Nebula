package com.neuralnebula.api.dto;

import java.util.List;

/** Search uses AND semantics: every normalized query token must match. */
public record SearchResponse(String matchMode, List<NoteResponse> results) { }
