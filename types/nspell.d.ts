declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean
    suggest(word: string): string[]
    add(word: string): NSpell
    remove(word: string): NSpell
  }
  function nspell(aff: string | Buffer | Uint8Array, dic?: string | Buffer | Uint8Array): NSpell
  function nspell(dict: { aff: string | Buffer | Uint8Array; dic?: string | Buffer | Uint8Array }): NSpell
  export = nspell
}
