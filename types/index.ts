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
