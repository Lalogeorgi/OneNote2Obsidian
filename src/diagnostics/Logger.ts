import {
  DiagnosticCode,
  DiagnosticEntry,
  DiagnosticSeverity,
  PerformanceMetric,
} from "./DiagnosticTypes";

export type DiagnosticListener = (entry: DiagnosticEntry) => void;
export type MetricListener = (metric: PerformanceMetric) => void;

export class StructuredLogger {
  private static instance: StructuredLogger;
  private entries: DiagnosticEntry[] = [];
  private metrics: PerformanceMetric[] = [];
  private listeners: Set<DiagnosticListener> = new Set();
  private metricListeners: Set<MetricListener> = new Set();
  private maxHistory = 500;

  private constructor() {}

  public static getInstance(): StructuredLogger {
    if (!StructuredLogger.instance) {
      StructuredLogger.instance = new StructuredLogger();
    }
    return StructuredLogger.instance;
  }

  public log(
    severity: DiagnosticSeverity,
    code: DiagnosticCode,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): DiagnosticEntry {
    const entry: DiagnosticEntry = {
      id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      code,
      severity,
      message,
      timestamp: Date.now(),
      context,
      stack: error?.stack,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxHistory) {
      this.entries.shift();
    }

    // Console formatting
    const prefix = `[OneNote][${severity.toUpperCase()}][${code}]`;
    switch (severity) {
      case "info":
        console.info(prefix, message, context ?? "");
        break;
      case "warning":
        console.warn(prefix, message, context ?? "");
        break;
      case "error":
      case "fatal":
        console.error(prefix, message, context ?? "", error ?? "");
        break;
    }

    this.notifyListeners(entry);
    return entry;
  }

  public info(
    code: DiagnosticCode,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): DiagnosticEntry {
    return this.log("info", code, message, context, error);
  }

  public warn(
    code: DiagnosticCode,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): DiagnosticEntry {
    return this.log("warning", code, message, context, error);
  }

  public error(
    code: DiagnosticCode,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): DiagnosticEntry {
    return this.log("error", code, message, context, error);
  }

  public fatal(
    code: DiagnosticCode,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): DiagnosticEntry {
    return this.log("fatal", code, message, context, error);
  }

  public recordMetric(name: string, durationMs: number, details?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      durationMs,
      timestamp: Date.now(),
      details,
    };
    this.metrics.push(metric);
    if (this.metrics.length > this.maxHistory) {
      this.metrics.shift();
    }
    for (const listener of this.metricListeners) {
      try {
        listener(metric);
      } catch (err) {
        console.error("Error in metric listener:", err);
      }
    }
  }

  public time<T>(name: string, fn: () => T, details?: Record<string, unknown>): T {
    const start = performance.now();
    try {
      return fn();
    } finally {
      this.recordMetric(name, performance.now() - start, details);
    }
  }

  public async timeAsync<T>(
    name: string,
    fn: () => Promise<T>,
    details?: Record<string, unknown>
  ): Promise<T> {
    const start = performance.now();
    try {
      return await fn();
    } finally {
      this.recordMetric(name, performance.now() - start, details);
    }
  }

  public subscribe(listener: DiagnosticListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeMetrics(listener: MetricListener): () => void {
    this.metricListeners.add(listener);
    return () => this.metricListeners.delete(listener);
  }

  private notifyListeners(entry: DiagnosticEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error("Error in diagnostic listener:", err);
      }
    }
  }

  public getHistory(): readonly DiagnosticEntry[] {
    return this.entries;
  }

  public getMetrics(): readonly PerformanceMetric[] {
    return this.metrics;
  }

  public clear(): void {
    this.entries = [];
    this.metrics = [];
  }
}

export const logger = StructuredLogger.getInstance();
