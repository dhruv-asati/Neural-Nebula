package com.neuralnebula.service;

public final class ApiNotFoundException extends RuntimeException {
    public ApiNotFoundException(String message) { super(message); }
}
