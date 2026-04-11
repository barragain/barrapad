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
  isShared?: boolean        // owner's note that has at least one active share link
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
  ownerName?: string
}

export interface CollabNotification {
  id: string
  type: 'mention' | 'shared' | 'deleted' | 'permission_changed' | 'opened' | 'access_request' | 'access_response' | 'comment' | 'comment_reply' | 'comment_mention' | 'comment_resolved'
  noteId?: string
  noteTitle: string
  message: string
  timestamp: string
  read?: boolean
  readAt?: string
  fromUserId?: string
  fromName?: string
  fromAvatar?: string
  metadata?: Record<string, unknown>
}

export interface AccessRequestRecord {
  id: string
  noteId: string
  noteTitle: string
  requesterId: string
  requesterName: string
  requesterAvatar: string
  status: 'pending' | 'accepted' | 'denied'
  resolvedBy?: string
  resolvedByName?: string
  grantedPermission?: string
  createdAt: string
  resolvedAt?: string
}

export interface MentionableUser {
  id: string
  username: string
  displayName: string
  imageUrl: string
  email: string
}

export interface MentionableNote {
  id: string
  title: string
  isOwner: boolean
  ownerName?: string
}

export interface AppearanceSettings {
  mode: 'light' | 'dark' | 'system'
  font: 'sans' | 'serif' | 'mono' | 'comic'
  zoom: number
  theme: 'default' | 'calm' | 'synthwave' | 'earth' | 'barrapad' | 'midnight'
}
