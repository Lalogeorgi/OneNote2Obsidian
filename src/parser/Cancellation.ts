/**
 * Cooperative cancellation mechanism for asynchronous ingestion/parsing operations.
 */

export class OperationCancelledError extends Error {
  constructor(message = "Operation was cancelled by user.") {
    super(message);
    this.name = "OperationCancelledError";
  }
}

export interface CancellationToken {
  readonly isCancellationRequested: boolean;
  onCancelled(callback: () => void): () => void;
  throwIfCancelled(): void;
}

export class CancellationTokenSource {
  private _isCancelled = false;
  private listeners: Set<() => void> = new Set();

  public readonly token: CancellationToken;

  constructor() {
    const self = this;
    this.token = {
      get isCancellationRequested(): boolean {
        return self._isCancelled;
      },
      onCancelled: (callback: () => void) => {
        if (self._isCancelled) {
          callback();
          return () => {};
        }
        self.listeners.add(callback);
        return () => self.listeners.delete(callback);
      },
      throwIfCancelled: () => {
        if (self._isCancelled) {
          throw new OperationCancelledError();
        }
      },
    };
  }

  public cancel(): void {
    if (this._isCancelled) return;
    this._isCancelled = true;
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("Error in cancellation listener:", err);
      }
    }
    this.listeners.clear();
  }
}
