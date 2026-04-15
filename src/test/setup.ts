import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

Element.prototype.scrollIntoView = vi.fn();

// Ensure clean DOM between tests (helps when multiple components render similar elements)
afterEach(() => cleanup());
