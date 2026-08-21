import { describe, expect, it } from "vitest";
import { DiagnosticCode } from "../src/diagnostics/DiagnosticTypes";
import { logger } from "../src/diagnostics/Logger";

describe("Diagnostics & Structured Logging", () => {
  it("logs structured entries with severity and codes", () => {
    logger.clear();

    const entry = logger.warn(
      DiagnosticCode.PARSER_ENCRYPTED_SECTION,
      "Section requires password",
      { sectionId: "sec_123" }
    );

    expect(entry.code).toBe(DiagnosticCode.PARSER_ENCRYPTED_SECTION);
    expect(entry.severity).toBe("warning");
    expect(entry.context?.sectionId).toBe("sec_123");

    const history = logger.getHistory();
    expect(history.length).toBe(1);
  });

  it("times operations and records performance metrics", () => {
    logger.clear();

    const result = logger.time("test_computation", () => {
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      return sum;
    });

    expect(result).toBe(499500);

    const metrics = logger.getMetrics();
    expect(metrics.length).toBe(1);
    expect(metrics[0]?.name).toBe("test_computation");
    expect(metrics[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
