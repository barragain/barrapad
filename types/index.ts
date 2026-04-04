export interface Tag {
  id: string
  label: string
  color: string
}

export interface Note {
  id: string
  userId: string
  title: string
  content: string
  tags: Tag[]
  createdAt: string
  updatedAt: string
  // Set on shared notes opened inside the main editor (not present on own notes)
  sharedToken?: string
  sharedPermission?: 'READ' | 'EDIT'
  sharedNoteId?: string  // real DB note ID — used as the PartyKit room
}

export interface SharedAccessRecord {
  id: string
  noteId: string
  noteTitle: string
  token: string
  permission: string
  lastSeen: string
}

export interface AppearanceSettings {
  mode: 'light' | 'dark' | 'system'
  font: 'sans' | 'serif' | 'mono' | 'comic'
  zoom: number
  theme: 'default' | 'calm' | 'synthwave' | 'earth' | 'barrapad' | 'midnight'
}
