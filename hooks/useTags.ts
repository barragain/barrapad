'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Note, Tag } from '@/types'

// Persistent tag registry: tags survive even when no note uses them.
// Union'd with note-derived tags to build the full suggestion list.
const REGISTRY_KEY = 'barrapad_tag_registry'

function loadTagRegistry(): Tag[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(REGISTRY_KEY)
    if (raw) return JSON.parse(raw) as Tag[]
  } catch {}
  return []
}

// Temp, shared and guest notes have no row of their own to PATCH.
const isOwnSavedNote = (id: string) => !id.startsWith('temp-') && !id.startsWith('shared-') && !id.startsWith('local-')

function patchTags(id: string, tags: Tag[]) {
  return fetch(`/api/notes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  })
}

export function useTags(
  notes: Note[],
  activeNoteId: string | null,
  updateNotes: (updater: (prev: Note[]) => Note[]) => void,
) {
  const [tagRegistry, setTagRegistry] = useState<Tag[]>(() => loadTagRegistry())

  /** Deduplicated list of all tags: union of registry + note-derived tags. Registry wins on label match. */
  const allTags = useMemo<Tag[]>(() => {
    const seen = new Map<string, Tag>()
    for (const tag of tagRegistry) {
      seen.set(tag.label.toLowerCase(), tag)
    }
    for (const note of notes) {
      for (const tag of (note.tags ?? [])) {
        if (!seen.has(tag.label.toLowerCase())) seen.set(tag.label.toLowerCase(), tag)
      }
    }
    return [...seen.values()]
  }, [notes, tagRegistry])

  /** Persist registry whenever it changes */
  useEffect(() => {
    try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(tagRegistry)) } catch {}
  }, [tagRegistry])

  /** Merge a batch of tags into the registry (idempotent). Used when tags are added to notes. */
  const mergeIntoRegistry = useCallback((tags: Tag[]) => {
    if (!tags.length) return
    setTagRegistry(prev => {
      const map = new Map(prev.map(t => [t.label.toLowerCase(), t]))
      let changed = false
      for (const t of tags) {
        const key = t.label.toLowerCase()
        const existing = map.get(key)
        if (!existing || existing.color !== t.color || existing.label !== t.label) {
          map.set(key, t)
          changed = true
        }
      }
      return changed ? [...map.values()] : prev
    })
  }, [])

  /** Save tags for the active note — fires immediately (no debounce, discrete operation) */
  const handleTagsChange = useCallback(async (tags: Tag[]) => {
    if (!activeNoteId || activeNoteId.startsWith('temp-')) return
    const activeNote = notes.find(n => n.id === activeNoteId)
    updateNotes(prev => prev.map(n => n.id === activeNoteId ? { ...n, tags } : n))
    mergeIntoRegistry(tags)
    if (activeNote?.sharedToken) {
      if (activeNote.sharedPermission !== 'EDIT') return
      try {
        await fetch(`/api/share/${activeNote.sharedToken}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tags }),
        })
      } catch {}
      return
    }
    if (activeNoteId.startsWith('local-')) return
    try { await patchTags(activeNoteId, tags) } catch {}
  }, [activeNoteId, notes, updateNotes, mergeIntoRegistry])

  // Rename and delete work out the affected notes from `notes` up front: a
  // setState updater may run later, so collecting them inside it can leave
  // the list empty when the PATCH loop runs.
  const rewriteTags = useCallback((rewrite: (tags: Tag[]) => Tag[] | null) => {
    const changed = new Map<string, Tag[]>()
    for (const n of notes) {
      const next = rewrite(n.tags ?? [])
      if (next) changed.set(n.id, next)
    }
    if (!changed.size) return
    updateNotes(prev => prev.map(n => changed.has(n.id) ? { ...n, tags: changed.get(n.id)! } : n))
    for (const [id, tags] of changed) {
      if (isOwnSavedNote(id)) patchTags(id, tags).catch(() => {})
    }
  }, [notes, updateNotes])

  /** Rename a tag across ALL notes that use it, and update the registry */
  const handleRenameTag = useCallback(async (oldLabel: string, newLabel: string, newColor: string) => {
    const old = oldLabel.toLowerCase()
    rewriteTags(tags => {
      const idx = tags.findIndex(t => t.label.toLowerCase() === old)
      if (idx === -1) return null
      const next = [...tags]
      next[idx] = { ...next[idx], label: newLabel, color: newColor }
      return next
    })
    // Update registry: drop the old label, add the renamed one
    setTagRegistry(prev => {
      const map = new Map(prev.map(t => [t.label.toLowerCase(), t]))
      const existing = map.get(old)
      map.delete(old)
      map.set(newLabel.toLowerCase(), {
        id: existing?.id ?? crypto.randomUUID(),
        label: newLabel,
        color: newColor,
      })
      return [...map.values()]
    })
  }, [rewriteTags])

  /** Delete a tag from ALL notes and from the registry (permanent) */
  const handleDeleteTag = useCallback(async (label: string) => {
    const gone = label.toLowerCase()
    rewriteTags(tags => {
      const filtered = tags.filter(t => t.label.toLowerCase() !== gone)
      return filtered.length === tags.length ? null : filtered
    })
    setTagRegistry(prev => prev.filter(t => t.label.toLowerCase() !== gone))
  }, [rewriteTags])

  return { allTags, handleTagsChange, handleRenameTag, handleDeleteTag }
}
