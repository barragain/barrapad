export interface Note {
  id: string
  userId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface AppearanceSettings {
  mode: 'light' | 'dark' | 'system'
  font: 'sans' | 'serif' | 'mono' | 'comic'
  zoom: number
  theme: 'default' | 'calm' | 'synthwave' | 'earth' | 'barrapad' | 'midnight'
}
