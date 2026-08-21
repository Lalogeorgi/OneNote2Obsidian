import { describe, expect, it, vi } from "vitest";
import {
  CancellationTokenSource,
  OperationCancelledError,
} from "../src/parser/Cancellation";
import { ProgressReporter, ProgressStage } from "../src/parser/Progress";

describe("Cancellation & Progress Reporting", () => {
  it("triggers cancellation token callbacks and throws when requested", () => {
    const cts = new CancellationTokenSource();
    const token = cts.token;
    const callback = vi.fn();

    token.onCancelled(callback);
    expect(token.isCancellationRequested).toBe(false);

    cts.cancel();
    expect(token.isCancellationRequested).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);

    expect(() => token.throwIfCancelled()).toThrow(OperationCancelledError);
  });

  it("reports granular progress stages and percentages", () => {
    const reporter = new ProgressReporter();
    const updates: string[] = [];

    reporter.subscribe((u) => {
      updates.push(`${u.stage}:${u.percent}%`);
    });

    reporter.report(ProgressStage.READING_FILE, "Reading...", 10);
    reporter.report(ProgressStage.PARSING_OBJECT_SPACES, "Parsing...", 50);
    reporter.report(ProgressStage.COMPLETE, "Done", 100);

    expect(updates).toContain("READING_FILE:10%");
    expect(updates).toContain("PARSING_OBJECT_SPACES:50%");
    expect(updates).toContain("COMPLETE:100%");
  });
});
