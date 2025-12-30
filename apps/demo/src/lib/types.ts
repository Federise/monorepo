export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';
