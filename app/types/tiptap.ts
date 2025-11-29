// Shared types for Tiptap editor content

export interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  attrs?: {
    id?: string;
    label?: string;
  };
}

export interface TiptapDoc extends TiptapNode {
  type: "doc";
  content: TiptapNode[];
}
