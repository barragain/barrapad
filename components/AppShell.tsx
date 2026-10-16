'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Save, Share2, X, Cloud, CloudCheck, RefreshCw, HardDrive, Download, ChevronDown, Menu } from 'lucide-react'
import Link from 'next/link'
import { useAuth, useUser } from '@clerk/nextjs'
import { AnimatePresence, motion } from 'framer-motion'
import { downloadTxt, downloadMd, downloadPdf, downloadDocx } from '@/lib/export'
import Sidebar from './Sidebar'
import EditorWrapper from './EditorWrapper'
import ShareModal from './ShareModal'
import AppearanceModal from './AppearanceModal'
import OnboardingModal from './OnboardingModal'
import NotificationBell from './NotificationBell'
import AccessDeniedView from './AccessDeniedView'
import type { Note, AppearanceSettings, SharedAccessRecord, CollabNotification } from '@/types'

import { useNotifications, loadKnownShared } from '@/hooks/useNotifications'
import { useTags } from '@/hooks/useTags'
import { useNotes } from '@/hooks/useNotes'
import { useSharedNotes } from '@/hooks/useSharedNotes'


const DEFAULT_APPEARANCE: AppearanceSettings = {
  mode: 'light',
  font: 'mono',
  zoom: 16,
  theme: 'barrapad',
}

function loadAppearance(): AppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = localStorage.getItem('barrapad_appearance')
    if (raw) return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_APPEARANCE
}

function applyAppearance(settings: AppearanceSettings) {
  const root = document.documentElement
  root.setAttribute('data-theme', settings.theme)
  root.setAttribute('data-font', settings.font)
  if (settings.mode === 'dark') {
    root.classList.add('dark')
  } else if (settings.mode === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
  root.style.setProperty('--editor-size', `${settings.zoom}px`)
}

export default function AppShell({ initialNotes, guest = false }: { initialNotes?: Note[]; guest?: boolean } = {}) {
  const { isLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const needsOnboarding = isLoaded && isSignedIn && user && !user.firstName
  // Server knows the auth state before Clerk boots in the browser.
  const isGuest = isLoaded ? !isSignedIn : guest
  const {
    notes, notesRef, updateNotes, activeNoteId, setActiveNoteId,
    notesLoaded, setNotesLoaded, manualSaving, autoSaving, selfDeleteRef,
    fetchNotes, handleLocalChange, handleRemoteContent, handleAutoSave, handleManualSaveContent,
    handleNewNote, handleRenameNote, handleDeleteNote,
  } = useNotes({ initialNotes, guest, isGuest, isSignedIn })
  const [showShare, setShowShare] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [appearance, setAppearance] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [guestStorageFull, setGuestStorageFull] = useState(false)
  // Guest pill shows after a short beat (not on top of the first paint) and
  // stays away once dismissed.
  const [pillReady, setPillReady] = useState(false)
  const [pillDismissed, setPillDismissed] = useState(false)
  useEffect(() => {
    try { setPillDismissed(localStorage.getItem('bpad_guest_pill_dismissed') === '1') } catch {}
    const t = setTimeout(() => setPillReady(true), 900)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    const onStorage = (e: Event) => setGuestStorageFull((e as CustomEvent<{ full: boolean }>).detail.full)
    window.addEventListener('bpad:guest-storage', onStorage)
    return () => window.removeEventListener('bpad:guest-storage', onStorage)
  }, [])
  // Brief "Saved" tick after a save finishes, so the sync indicator closes the loop.
  const [justSaved, setJustSaved] = useState(false)
  const wasSavingRef = useRef(false)
  useEffect(() => {
    const saving = autoSaving || manualSaving
    if (wasSavingRef.current && !saving) {
      setJustSaved(true)
      const t = setTimeout(() => setJustSaved(false), 1600)
      wasSavingRef.current = false
      return () => clearTimeout(t)
    }
    wasSavingRef.current = saving
  }, [autoSaving, manualSaving])
  const { notifications, setNotifications, detectSharedNotesChanges } =
    useNotifications(isLoaded && isSignedIn && user ? user.id : null)
  const {
    sharedNotes, setSharedNotes, sharedNotesRef, fetchShared, openSharedNote,
    handleRenameSharedNote, handleRemoveSharedNote, handleDeleteSharedNote,
  } = useSharedNotes({ isLoaded, isSignedIn, notes, notesRef, updateNotes, activeNoteId, setActiveNoteId, detectSharedNotesChanges })
  const [showNotifs, setShowNotifs] = useState(false)
  const [accessDeniedNoteId, setAccessDeniedNoteId] = useState<string | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const activeNote = notes.find((n) => n.id === activeNoteId) ?? null

  useEffect(() => {
    const settings = loadAppearance()
    setAppearance(settings)
    applyAppearance(settings)
  }, [])

  // Update document title whenever the active note changes
  useEffect(() => {
    const noteName = activeNote?.title
    document.title = noteName
      ? `${noteName} | bpad - A notepad for whatever`
      : 'bpad - A notepad for whatever'
  }, [activeNote?.title])

  const refresh = () => Promise.all([fetchNotes(), fetchShared()])

  // Background sync — re-runs when Clerk finishes loading or auth state changes
  // This fixes the case where the session isn't ready on first mount (e.g. just after login)
  useEffect(() => {
    if (isLoaded) refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn])
  // Guests don't need to wait for Clerk: their notes are already in this browser.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (guest) fetchNotes() }, [])

  // Re-fetch whenever the tab comes back: visibility (tab switch), window focus
  // (switching between windows does NOT fire visibilitychange) and reconnect.
  // After a long absence lock editing again until the fetch lands, so edits
  // made on another computer in the meantime cannot be typed over.
  useEffect(() => {
    if (!isSignedIn) return
    let hiddenAt = 0
    const onReturn = () => {
      if (document.hidden) { hiddenAt = Date.now(); return }
      if (hiddenAt && Date.now() - hiddenAt > 60_000) setNotesLoaded(false)
      hiddenAt = 0
      refresh()
    }
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    window.addEventListener('online', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
      window.removeEventListener('online', onReturn)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn])

  const { allTags, handleTagsChange, handleRenameTag, handleDeleteTag } = useTags(notes, activeNoteId, updateNotes)

  // Called when a note is deleted by someone else via real-time broadcast
  const handleNoteDeleted = useCallback((noteId: string) => {
    if (noteId.startsWith('shared-')) {
      const token = noteId.replace('shared-', '')
      // Immediately create notification instead of waiting for the 10s poll
      const record = sharedNotesRef.current.find((r) => r.token === token)
      if (record) {
        const who = record.ownerName || 'Someone'
        const notif: CollabNotification = {
          id: `deleted-${token}`,
          type: 'deleted',
          noteTitle: record.noteTitle,
          message: `${who} removed access to "${record.noteTitle || 'a shared note'}"`,
          timestamp: new Date().toISOString(),
        }
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev
          return [notif, ...prev]
        })
        // Remove from localStorage snapshot so the 10s poll doesn't duplicate the notification
        const known = loadKnownShared()
        if (known[token]) {
          delete known[token]
          try { localStorage.setItem('barrapad_known_shared', JSON.stringify(known)) } catch {}
        }
      }
      setSharedNotes((prev) => prev.filter((r) => r.token !== token))
    } else if (!selfDeleteRef.current.has(noteId)) {
      // Owned note deleted remotely by a collaborator — notify the owner
      const deletedNote = notes.find((n) => n.id === noteId)
      if (deletedNote) {
        const notif: CollabNotification = {
          id: `deleted-owned-${noteId}`,
          type: 'deleted',
          noteTitle: deletedNote.title,
          message: `A collaborator deleted your note "${deletedNote.title || 'Untitled'}"`,
          timestamp: new Date().toISOString(),
        }
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev
          return [notif, ...prev]
        })
      }
    }
    updateNotes((prev) => prev.filter((n) => n.id !== noteId))
    setActiveNoteId((prev) => {
      if (prev !== noteId) return prev
      const remaining = notes.filter((n) => n.id !== noteId && !n.sharedToken)
      return remaining[0]?.id ?? null
    })
  }, [notes, updateNotes])

  const triggerManualSave = () => {
    window.dispatchEvent(new Event('barrapad:save'))
  }

  const handleExport = async (fmt: 'txt' | 'md' | 'pdf' | 'docx') => {
    if (!activeNote) return
    setShowExport(false)
    const title = activeNote.title || 'note'
    const html = activeNote.content || ''
    if (fmt === 'txt') downloadTxt(title, html)
    else if (fmt === 'md') await downloadMd(title, html)
    else if (fmt === 'pdf') {
      const editorEl = document.getElementById('barrapad-editor-content')
      await downloadPdf(title, html, editorEl)
    }
    else if (fmt === 'docx') await downloadDocx(title, html)
  }

  // Close export dropdown when clicking outside
  useEffect(() => {
    if (!showExport) return
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExport])

  const handleAppearanceChange = (settings: AppearanceSettings) => {
    setAppearance(settings)
    applyAppearance(settings)
    localStorage.setItem('barrapad_appearance', JSON.stringify(settings))
  }

  // ── Note mention click handler ──────────────────────────────────────────
  const handleNoteMentionClick = useCallback(async (mentionedNoteId: string) => {
    // Check own notes first
    const ownNote = notes.find((n) => n.id === mentionedNoteId && !n.sharedToken)
    if (ownNote) {
      setActiveNoteId(mentionedNoteId)
      setAccessDeniedNoteId(null)
      return
    }

    // Check shared notes
    const shared = sharedNotes.find((r) => r.noteId === mentionedNoteId)
    if (shared) {
      openSharedNote(shared.token)
      setAccessDeniedNoteId(null)
      return
    }

    // Check access via API
    try {
      const res = await fetch(`/api/notes/${mentionedNoteId}/access`)
      if (!res.ok) {
        setAccessDeniedNoteId(mentionedNoteId)
        return
      }
      const data = await res.json() as { access: boolean; permission?: string }
      if (data.access) {
        // User has access — find or open the note
        if (data.permission === 'OWNER') {
          setActiveNoteId(mentionedNoteId)
        } else {
          // Need to find/create a share token to open it
          const freshShared = await fetch('/api/shared-notes').then(r => r.json()) as SharedAccessRecord[]
          const match = freshShared.find((r) => r.noteId === mentionedNoteId)
          if (match) openSharedNote(match.token)
        }
        setAccessDeniedNoteId(null)
      } else {
        setAccessDeniedNoteId(mentionedNoteId)
      }
    } catch {
      setAccessDeniedNoteId(mentionedNoteId)
    }
  }, [notes, sharedNotes, openSharedNote])

  // ── Access request action handler ───────────────────────────────────────
  const handleAccessRequestAction = useCallback(async (requestId: string, action: 'accept' | 'deny', permission?: string) => {
    try {
      const res = await fetch(`/api/access-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, permission }),
      })
      if (res.ok) {
        // Re-fetch notifications to get updated state
        const notifsRes = await fetch('/api/notifications')
        if (notifsRes.ok) {
          const data = await notifsRes.json() as CollabNotification[]
          setNotifications(data)
        }
      }
    } catch {}
  }, [])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--editor-bg)' }}>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="sidebar-backdrop"
            className="fixed inset-0 z-[60] md:hidden"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar — fixed overlay on mobile, normal flex child on desktop */}
      <div className="hidden md:flex md:flex-shrink-0">
        <Sidebar
          notes={notes}
          sharedNotes={sharedNotes}
          activeNoteId={activeNoteId}
          onSelectNote={setActiveNoteId}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
          onOpenSettings={() => setShowAppearance(true)}
          onRenameNote={handleRenameNote}
          onOpenSharedNote={openSharedNote}
          onRemoveSharedNote={handleRemoveSharedNote}
          onRenameSharedNote={handleRenameSharedNote}
          onDeleteSharedNote={handleDeleteSharedNote}
          onRenameTag={handleRenameTag}
          onDeleteTag={handleDeleteTag}
          allTags={allTags}
        />
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="mobile-sidebar"
            className="fixed inset-y-0 left-0 z-[61] md:hidden"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36, mass: 0.8 }}
          >
            <Sidebar
              notes={notes}
              sharedNotes={sharedNotes}
              activeNoteId={activeNoteId}
              onSelectNote={(id) => { setActiveNoteId(id); setSidebarOpen(false) }}
              onNewNote={() => { handleNewNote(); setSidebarOpen(false) }}
              onDeleteNote={handleDeleteNote}
              onOpenSettings={() => { setShowAppearance(true); setSidebarOpen(false) }}
              onRenameNote={handleRenameNote}
              onOpenSharedNote={(token) => { openSharedNote(token); setSidebarOpen(false) }}
              onRemoveSharedNote={handleRemoveSharedNote}
              onRenameSharedNote={handleRenameSharedNote}
              onDeleteSharedNote={handleDeleteSharedNote}
              onRenameTag={handleRenameTag}
              onDeleteTag={handleDeleteTag}
              allTags={allTags}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main area */}
      <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top action bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ background: 'var(--editor-bg)', borderColor: 'var(--border)' }}>
          {/* Hamburger — mobile only */}
          <button
            className="md:hidden p-1.5 rounded-lg hover:bg-black/5 transition-colors flex-shrink-0"
            style={{ color: 'var(--ink)' }}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          {/* Push everything else to the right */}
          <div className="flex-1" />

          {/* Sync indicator: spinning cloud while loading or saving, then a short "Saved" tick */}
          <AnimatePresence mode="wait">
            {!isGuest && (autoSaving || manualSaving || !notesLoaded) ? (
              <motion.span
                key="sync-busy"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--muted)' }}
                title={notesLoaded ? 'Saving to the cloud' : 'Loading your latest notes (read-only until done)'}
              >
                <span className="relative inline-flex">
                  <Cloud size={14} />
                  <RefreshCw size={7} strokeWidth={3} className="absolute inset-0 m-auto translate-y-[1px] animate-spin [animation-duration:1.1s]" />
                </span>
                {notesLoaded ? 'Syncing' : 'Loading'}
              </motion.span>
            ) : !isGuest && justSaved ? (
              <motion.span
                key="sync-done"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-1 text-[11px]"
                style={{ color: 'var(--muted)' }}
                title="All changes saved"
              >
                <CloudCheck size={14} />
                Saved
              </motion.span>
            ) : null}
          </AnimatePresence>

          {isLoaded && isSignedIn && (
            <NotificationBell
              notifications={notifications}
              open={showNotifs}
              onToggle={() => setShowNotifs((v) => !v)}
              onMarkAllRead={() => {
                const now = new Date().toISOString()
                setNotifications((prev) =>
                  prev.map((n) => n.read ? n : { ...n, read: true, readAt: now })
                )
                fetch('/api/notifications', { method: 'PATCH' }).catch(() => {})
              }}
              onDeleteAll={() => {
                setNotifications([])
                fetch('/api/notifications', { method: 'DELETE' }).catch(() => {})
              }}
              onAccessRequestAction={handleAccessRequestAction}
              onNotificationClick={(n) => {
                if (!n.noteId) return
                setShowNotifs(false)
                handleNoteMentionClick(n.noteId)
                // Mark as read
                if (!n.read) {
                  setNotifications((prev) =>
                    prev.map((notif) => notif.id === n.id ? { ...notif, read: true, readAt: new Date().toISOString() } : notif)
                  )
                  fetch(`/api/notifications/${n.id}`, { method: 'PATCH' }).catch(() => {})
                }
                // If it's a comment notification, open the sidebar and highlight the thread
                if (n.type === 'comment' || n.type === 'comment_reply' || n.type === 'comment_mention' || n.type === 'comment_resolved') {
                  const meta = (n.metadata ?? {}) as Record<string, unknown>
                  // Small delay to let the note switch complete first
                  setTimeout(() => {
                    window.dispatchEvent(new Event('barrapad:toggle-comments'))
                    if (meta.markCommentId) {
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('barrapad:comment-activate-mark', {
                          detail: { markCommentId: meta.markCommentId },
                        }))
                      }, 300)
                    }
                  }, 200)
                }
              }}
            />
          )}

          {activeNote && (
            <div ref={exportRef} className="relative">
              <button
                onClick={() => setShowExport((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-black/5 transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
              >
                <Download size={13} />
                Export
                <ChevronDown size={11} className={`transition-transform duration-150 ${showExport ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence>
                {showExport && (
                  <motion.div
                    key="export-dropdown"
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full right-0 mt-1 z-[55] rounded-xl shadow-xl p-1.5"
                    style={{ background: 'var(--editor-bg)', border: '1px solid var(--border)', minWidth: 190 }}
                  >
                    {([
                      { fmt: 'pdf',  label: '.pdf'  },
                      { fmt: 'md',   label: '.md'   },
                      { fmt: 'txt',  label: '.txt'  },
                      { fmt: 'docx', label: '.docx' },
                    ] as const).map(({ fmt, label }) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                        style={{ color: 'var(--ink)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--border)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="text-sm font-semibold">{label}</span>
                      </button>
                    ))}
                    <div
                      className="mx-1 mt-1 mb-0.5 px-3 py-2 rounded-xl text-center text-[11px] font-medium leading-snug"
                      style={{ background: '#D4550A1A', color: '#D4550A' }}
                    >
                      PDF preserves your design.<br />Others export basic or no styles.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {activeNote && isGuest && (
            <Link
              href="/sign-up"
              title="Sign up to share notes"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-black/5 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <Share2 size={13} />
              Share
            </Link>
          )}
          {activeNote && !isGuest && (!activeNote.sharedToken || activeNote.sharedPermission === 'EDIT') && (
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-black/5 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              <Share2 size={13} />
              Share
            </button>
          )}
          <button
            onClick={triggerManualSave}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:opacity-80 transition-opacity"
            style={{ background: 'var(--ink)', color: 'var(--editor-bg)' }}
          >
            <Save size={13} />
            {manualSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          {accessDeniedNoteId ? (
            <AccessDeniedView
              noteId={accessDeniedNoteId}
              onBack={() => setAccessDeniedNoteId(null)}
              onAccessGranted={(grantedNoteId) => {
                setAccessDeniedNoteId(null)
                handleNoteMentionClick(grantedNoteId)
              }}
            />
          ) : activeNote ? (
            <EditorWrapper
              note={activeNote}
              allTags={allTags}
              serverReady={notesLoaded}
              onLocalChange={handleLocalChange}
              onRemoteContent={handleRemoteContent}
              onAutoSave={handleAutoSave}
              onManualSave={handleManualSaveContent}
              onTagsChange={handleTagsChange}
              onNoteDeleted={handleNoteDeleted}
              onNoteMentionClick={handleNoteMentionClick}
              onRenameTag={handleRenameTag}
              onDeleteTag={handleDeleteTag}
            />
          ) : !notesLoaded ? null : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>No note selected</p>
                <button
                  onClick={handleNewNote}
                  className="px-4 py-2 bg-[#D4550A] text-white rounded-lg text-sm hover:bg-[#c04009] transition-colors"
                >
                  Create a note
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom strip */}
        <div className="flex items-center justify-end px-4 py-1 border-t" style={{ background: 'var(--editor-bg)', borderColor: 'var(--border)' }}>
          <button
            className="p-1.5 rounded hover:bg-black/5 transition-colors"
            style={{ color: 'var(--muted)' }}
            title="Close note"
            onClick={() => setActiveNoteId(null)}
          >
            <X size={15} />
          </button>
        </div>

      {/* Guest pill: same floating style as the shared-note CTA. Dismissible,
          except when storage is full, because then edits are being lost. */}
      <AnimatePresence>
        {isGuest && pillReady && (guestStorageFull || !pillDismissed) && (
          <motion.div
            key={guestStorageFull ? 'guest-pill-full' : 'guest-pill'}
            role={guestStorageFull ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 16, x: '-50%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="absolute bottom-0.5 left-[calc(50%-16px)] sm:left-1/2 z-50 flex items-center gap-2.5 rounded-full py-1 pl-4 pr-1 whitespace-nowrap"
            style={{ background: '#1A1A1A', color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}
          >
            {guestStorageFull ? (
              <span className="flex items-center gap-2 text-xs font-medium">
                <span className="h-2 w-2 rounded-full" style={{ background: '#E5484D' }} />
                <span className="hidden sm:inline">Browser storage full, changes not saved</span>
                <span className="sm:hidden">Storage full</span>
              </span>
            ) : (
              <span className="flex items-center gap-2 text-xs" style={{ color: '#D9D4CC' }}>
                <HardDrive size={12} />
                <span className="hidden sm:inline">Saved on this device only</span>
                <span className="sm:hidden">Local only</span>
              </span>
            )}
            <Link
              href="/sign-up"
              title="Sign up to keep your notes in the cloud and share them"
              className="rounded-full px-3.5 py-1 text-xs font-bold text-white hover:opacity-90 transition-opacity"
              style={{ background: '#D4550A' }}
            >
              Sign up to sync
            </Link>
            {!guestStorageFull && (
              <button
                onClick={() => {
                  setPillDismissed(true)
                  try { localStorage.setItem('bpad_guest_pill_dismissed', '1') } catch {}
                }}
                aria-label="Dismiss"
                className="rounded-full p-1 transition-colors hover:bg-white/10"
                style={{ color: '#8A8178' }}
              >
                <X size={13} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Onboarding — collect name on first sign-up */}
      {needsOnboarding && <OnboardingModal />}

      {/* Modals */}
      {showShare && activeNote && (
        <ShareModal
          note={activeNote}
          onClose={() => setShowShare(false)}
          onIsSharedChange={(hasLinks) =>
            updateNotes(prev => prev.map(n => n.id === activeNote.id ? { ...n, isShared: hasLinks } : n))
          }
        />
      )}
      {showAppearance && (
        <AppearanceModal
          settings={appearance}
          onChange={handleAppearanceChange}
          onClose={() => setShowAppearance(false)}
        />
      )}
    </div>
  )
}
