export const NotesStorageKeys = Object.freeze({ USER_NOTES: 'userNotes' });

export interface UserNote {
  id: string;
  gameName: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export type NoteUpdates = Partial<Pick<UserNote, 'title' | 'content' | 'gameName'>>;

/** Normalize stored records at the persistence boundary; preserve every addressable note. */
export function readStoredNote(value: unknown): UserNote | null {
  if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') return null;
  const record = value as Record<string, unknown>;
  return {
    id: value.id,
    gameName: typeof record.gameName === 'string' ? record.gameName : '',
    title: typeof record.title === 'string' ? record.title : '',
    content: typeof record.content === 'string' ? record.content : '',
    createdAt: typeof record.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : 0,
    updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? record.updatedAt : 0
  };
}
