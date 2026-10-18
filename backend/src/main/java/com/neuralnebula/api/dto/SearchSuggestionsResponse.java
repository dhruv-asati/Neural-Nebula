package com.neuralnebula.api.dto;

import com.neuralnebula.dsa.EditDistance;

import java.util.List;

/** Prefix suggestions come first; corrections are single-token terms within edit distance two. */
public record SearchSuggestionsResponse(List<String> autocomplete,
                                        List<EditDistance.Correction> corrections) { }
