package com.neuralnebula.api.dto;

public record ErrorResponse(int status, String code, String message, String path) { }
