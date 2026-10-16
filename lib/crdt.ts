// Per-browser switch for Yjs live merging while it is on trial.
// `?crdt=1` turns it on for this browser, `?crdt=0` turns it off.
export function crdtEnabled() {
  try {
    const q = new URLSearchParams(window.location.search).get('crdt')
    if (q === '1' || q === '0') localStorage.setItem('bpad_crdt', q)
    return localStorage.getItem('bpad_crdt') === '1'
  } catch {
    return false
  }
}
