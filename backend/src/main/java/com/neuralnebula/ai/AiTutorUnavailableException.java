package com.neuralnebula.ai;

public final class AiTutorUnavailableException extends RuntimeException {
    public AiTutorUnavailableException() { super("The AI provider could not answer right now. Please try again shortly."); }
    public AiTutorUnavailableException(String message) { super(message); }
}
