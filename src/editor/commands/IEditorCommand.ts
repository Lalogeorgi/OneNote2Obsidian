export interface IEditorCommand {
  readonly id: string;
  readonly description: string;
  readonly timestamp: number;
  execute(): void;
  undo(): void;
}
