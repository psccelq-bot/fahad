
export enum SourceType {
  PDF = 'pdf',
  TEXT = 'text',
  EXCEL = 'excel',
  LINK = 'link'
}

export type SourceCategory = 'advisor' | 'repository';

export type SourceTheme = 'cyan' | 'royal' | 'emerald' | 'sunset' | 'midnight';

export interface SourceFile {
  id: string;
  name: string;
  type: SourceType;
  category: SourceCategory;
  content: string; // Base64 for files, URL for links
  mimeType: string;
  selected: boolean;
  theme?: SourceTheme;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}
