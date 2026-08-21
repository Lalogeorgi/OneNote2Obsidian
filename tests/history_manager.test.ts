import { describe, expect, it, vi } from "vitest";
import { IEditorCommand } from "../src/editor/commands/IEditorCommand";
import { HistoryManager } from "../src/editor/HistoryManager";

describe("HistoryManager & Undo/Redo Engine", () => {
  const createMockCommand = (desc: string): { cmd: IEditorCommand; execSpy: any; undoSpy: any } => {
    const execSpy = vi.fn();
    const undoSpy = vi.fn();
    const cmd: IEditorCommand = {
      id: `mock_${Math.random()}`,
      description: desc,
      timestamp: Date.now(),
      execute: execSpy,
      undo: undoSpy,
    };
    return { cmd, execSpy, undoSpy };
  };

  it("manages execution, undo, and redo stacks", () => {
    const history = new HistoryManager();
    const { cmd: cmd1, execSpy: e1, undoSpy: _u1 } = createMockCommand("cmd1");
    const { cmd: cmd2, execSpy: e2, undoSpy: u2 } = createMockCommand("cmd2");

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    history.execute(cmd1);
    expect(e1).toHaveBeenCalledTimes(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    history.execute(cmd2);
    expect(e2).toHaveBeenCalledTimes(1);

    // Undo cmd2
    expect(history.undo()).toBe(true);
    expect(u2).toHaveBeenCalledTimes(1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);

    // Redo cmd2
    expect(history.redo()).toBe(true);
    expect(e2).toHaveBeenCalledTimes(2);
    expect(history.canRedo()).toBe(false);
  });

  it("clears redo stack when executing a new command after undo", () => {
    const history = new HistoryManager();
    const { cmd: cmd1 } = createMockCommand("cmd1");
    const { cmd: cmd2 } = createMockCommand("cmd2");
    const { cmd: cmd3 } = createMockCommand("cmd3");

    history.execute(cmd1);
    history.execute(cmd2);
    history.undo();
    expect(history.canRedo()).toBe(true);

    history.execute(cmd3);
    expect(history.canRedo()).toBe(false);
    expect(history.getUndoStackSize()).toBe(2); // cmd1 and cmd3
  });

  it("enforces max history capacity bound", () => {
    const history = new HistoryManager(3);

    for (let i = 1; i <= 5; i++) {
      const { cmd } = createMockCommand(`cmd${i}`);
      history.execute(cmd);
    }

    expect(history.getUndoStackSize()).toBe(3);
  });

  it("emits onHistoryChange events on state changes", () => {
    const history = new HistoryManager();
    const listener = vi.fn();
    history.onHistoryChange = listener;

    const { cmd } = createMockCommand("cmd1");
    history.execute(cmd);
    expect(listener).toHaveBeenCalledWith(true, false);

    history.undo();
    expect(listener).toHaveBeenCalledWith(false, true);

    history.clear();
    expect(listener).toHaveBeenCalledWith(false, false);
  });
});
