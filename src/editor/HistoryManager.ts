import { IEditorCommand } from "./commands/IEditorCommand";

export class HistoryManager {
  private undoStack: IEditorCommand[] = [];
  private redoStack: IEditorCommand[] = [];
  public onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;

  constructor(private maxStackSize = 100) {}

  public execute(command: IEditorCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Clear redo stack on new action

    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    this.notifyChange();
  }

  public undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;

    cmd.undo();
    this.redoStack.push(cmd);
    this.notifyChange();
    return true;
  }

  public redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;

    cmd.execute();
    this.undoStack.push(cmd);
    this.notifyChange();
    return true;
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public getUndoStackSize(): number {
    return this.undoStack.length;
  }

  public getRedoStackSize(): number {
    return this.redoStack.length;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.notifyChange();
  }

  private notifyChange(): void {
    this.onHistoryChange?.(this.canUndo(), this.canRedo());
  }
}
