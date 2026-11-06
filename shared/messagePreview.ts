export interface MindMapTopic {
  id: string;
  title: string;
  children: MindMapTopic[];
}

export interface MindMapSheet {
  id: string;
  title: string;
  root: MindMapTopic;
}

export interface MessagePreviewRequest {
  source: string;
  projectPath?: string;
  sessionId?: string;
}

export type MessageFilePreview =
  | { kind: 'image'; name: string; dataUrl: string }
  | { kind: 'mindmap'; name: string; sheets: MindMapSheet[]; warnings: string[] }
  | { kind: 'mermaid'; name: string; content: string };
