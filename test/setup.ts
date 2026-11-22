import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Auto-cleanup doesn't register without vitest globals, so DOM would leak
// between tests in a file and duplicate-query.
afterEach(cleanup);