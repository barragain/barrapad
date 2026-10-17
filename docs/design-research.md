# Design research notes (2026-10-17)

This file keeps everything the research agents found on 2026-10-17, so a later session can continue the editor redesign without redoing the research. [design-audit.md](design-audit.md) is the short version with the plan. This file is the long version: the measurements, the per-format inventory, every source, and where the work stopped.

The user approved the whole plan in [design-audit.md](design-audit.md) and asked for it to be applied in order. They want to see the selection formatting bar in particular, to judge whether it can stand in for the 25-button toolbar. It does not have to replace the toolbar; build it and let them compare.

## Progress

| Step | State |
|---|---|
| 1. Spacing and text column | Done (89891ce, 483e31c). Checked with the visual audit: items 4.8 px apart, paragraph to list 9.6 px, divider 19.2 px, column 653 px desktop and 339 px phone. |
| 2. Bugs, dark mode, theme colors | Done (dc66ac8, 3ee6a4f and the commit after it). Paste, footnote, voice memo, `#` picker, duplicate Link and Underline, nested checklist markers, checked children, Normal Text leaving a quote, syntax colors, theme tokens replacing hardcoded hex across the editor UI, softer dark palette with one orange accent, muted text at 4.5:1, pastel highlight swatches with dark text, `color-scheme: dark`. Covered by `e2e/editor.mjs`. Left as is on purpose: two spell checkers run by design (the browser's gives the right-click suggestions and its underline is hidden), and bold in DM Mono stays synthesized because the font has no bold weight (see known-gaps.md). |
| 3. Calm UI | Done (fd1e2bc). Section 6 items 1, 3, 4, 6, 7 (phone), 8, 9, 10 and 13: unread dot with no count and no bell shake; guest "Local" label in the top bar and the sign-up pill only after the first edit, in neutral colors; the bottom strip with its stray close button is gone; neutral card frame at 8% ink replaces the spinning orange border, and phones have no frame and a 16 px gutter; note info opens from an icon in the top bar (and on the share page); "Shared with me" is a plain heading shown only when something is shared; quiet "Saved" status replaces the Save button and Ctrl+S saves; Export and Share are plain text buttons; fades instead of springs, `MotionConfig reducedMotion="user"` and a `prefers-reduced-motion` CSS rule. Item 2 (hide most of the toolbar) moves to step 4 with the selection bar. Items 11 (comfortable text) and 12 (focus mode) move to step 4; note that Appearance already offers sans and serif fonts. The share page top bar now uses the theme tokens too, so it follows dark mode. |
| 4. New ideas | In progress. Idea 2, the selection formatting bar, is done (`components/SelectionBar.tsx`, replaces the old floating Comment bubble, covered by `e2e/editor.mjs` and `e2e/poll.mjs`). The top toolbar is unchanged so the user can compare the two. The color rows expand to the full picker (user request). Idea 3 (quiet save status) was already done in step 3. Idea 1, the slash menu, is done (`extensions/slash-command.tsx`, `components/SlashMenu.tsx`). The placeholders now point at it ("Start writing, or type / for headings, lists, tables and more" in an empty note, a faint "Type / for blocks" on an empty line). Idea 9, the first note for guests, is done (`WELCOME_HTML` in `hooks/useNotes.ts`, covered by `e2e/guest.mjs`); an untouched welcome note is not imported on sign-in. Idea 8, focus mode, is done (state in `components/AppShell.tsx`, chrome tagged `data-chrome`, Tiptap `Focus` extension in deepest mode, dimming rules in `app/globals.css`, covered by `e2e/editor.mjs`); typewriter scrolling was left out. Next in order: the mobile keyboard toolbar, presence avatars, the command palette, collapsible headings, the drag handle, the spell checker replacement. Open question for the user: whether to slim the top toolbar now that the selection bar and slash menu exist (they said keeping both feels fine). Possible follow-ups: voice memo and tags in the slash menu; an X on the old toolbar's color and highlight dropdowns to match the bar. |

## Verifying

The visual audit script is kept at `e2e/visual-audit.mjs` (copied from the agent's scratch script). It opens the live site as a guest, pastes a sample note with every format, measures computed styles into `e2e/out/visual/metrics.json`, and saves screenshots at 1400x900 and 390x844 in light and dark mode into `e2e/out/visual/`. Run it with `node e2e/visual-audit.mjs` after each step and compare with the numbers below.

## 1. The live site before the redesign (visual audit)

The editor used DM Mono at 16 px with a 24 px line height (1.5). The text column was 833 px wide on desktop and 259 px on a 390 px phone.

| Element | Margin top / bottom | Line height | Padding left | Font size |
|---|---|---|---|---|
| p | 0 / 0 | 24 | 0 | 16 |
| li, li > p | 0 / 0 | 24 | 0 | 16 |
| ul, ol, nested ul | 0 / 0 | 24 | 24 | 16 |
| task list ul | 0 / 0 | 24 | 0 (li is flex, gap 8) | 16 |
| h1 | 16 / 16 | 48 | 0 | 32 (700) |
| h2 | 12 / 12 | 36 | 0 | 24 (600) |
| h3 | 10 / 10 | 30 | 0 | 20 (600) |
| blockquote | 12 / 12 | 24 | 20 plus a 4 px border | 16 |
| pre | 8 / 8 | 24 | 16 | 16 |
| hr | 24 / 24 | | | |
| table | 8 / 8 | 24 | | |
| td, th | 0 | 24 | 9.6 (6.4 top and bottom) | 16 |
| inline code | | 21.6 | 4.32 | 14.4 |

Paragraph to list was 0 px. Item to item was 0 px, the same as wrapped lines inside one item. A numbered list followed by a bullet list read as one list. On a phone one item wrapped to eight or nine lines.

Other things seen in the screenshots:
- Dark mode highlight is light text on pale yellow, close to unreadable.
- Dark mode inline code has no visible background.
- The selected note title in the dark sidebar is nearly invisible, and the search box is a light gray slab.
- The accent turns purple in dark mode (card border, link, quote bar, divider) while the toolbar and the "Sign up to sync" button stay orange.
- Table headers are centered while body cells are left aligned.
- The checked task strikethrough is low contrast in light mode.
- The divider gradient is barely visible in light mode.
- The info icon left of the card is cut off at the edge of a phone screen.
- H1 and H2 wrap on a phone.

## 2. Code audit of every format

The editor CSS lives in `app/globals.css` (core blocks around lines 175 to 330, footnote and poll after that, mentions near the end). Node views style themselves inline. Tailwind 4's preflight is the base stylesheet and zeroes the margins of p, lists, headings, blockquote, pre and hr, and sets line-height 1.5 everywhere. Tiptap injects `white-space: pre-wrap` on the editor and on `pre`. Editor padding came from `components/NoteEditorCore.tsx` (now the `.barrapad-scroll`, `.barrapad-card` and `.barrapad-editor-content` classes).

| Format | Trigger | Styling and problems found |
|---|---|---|
| Paragraph | dropdown "Normal Text", Ctrl+Alt+0 | Margin was 0. "Normal Text" calls `setParagraph()`, which does not unwrap a quote, so the dropdown cannot leave a quote. |
| H1 to H3 | dropdown, `#`, `##`, `###`, Ctrl+Alt+1 to 3 | Equal margin above and below (fixed in step 1). Fake bold, because DM Mono is loaded only at weights 300, 400 and 500. The dropdown label shows "Normal Text" for H4 to H6, lists and code blocks (`components/Toolbar.tsx:93-99`). |
| H4 to H6 | `####`, Ctrl+Alt+4 to 6 | Had no styles (step 1 gives them 1.1em, 600). Consider limiting heading levels to 1 to 3. |
| Bold, italic, underline | toolbar, Ctrl+B, I, U, markdown, context menu | Italic does nothing inside a quote, because quotes are italic. Underline can stack with link underline, spell check and the comment underline. |
| Strike | Ctrl+Shift+S, `~~x~~`, context menu | No toolbar button, so it cannot be reached on touch devices. |
| Link | toolbar, Ctrl/Cmd+K, context menu, autolink | No hover or focus style. `components/LinkPopover.tsx` is hardcoded white (`#fff`, `#C4BFB6`, `#F5F0E8`), so it stays white in dark mode. |
| Text color, gradient | Palette button (`Toolbar.tsx:251-280`), mobile sheet | Colors are saved as fixed hex, and `#000000` disappears in dark themes. Popover `bg-white`, unset button `#F5F0E8`. |
| Highlight | toolbar, Ctrl+Shift+H, `==x==` | `<mark>` with `color: inherit`, so dark mode puts light text on a light highlight. No padding or radius. Same swatches as text color, including black. |
| Bullet and numbered lists | toolbar, `-`, `*`, `1.`, Ctrl+Shift+7 and 8 | Fixed in step 1. Two-digit numbers may hang past the gutter in DM Mono; the `ol` padding went to 1.9em for that, so check "10." in a screenshot. Markers stay at the left edge when a list item is centered. |
| Checklist | toolbar, `[ ]`, Ctrl+Shift+9 | Fixed in step 1 (child selectors, alignment, accent checkbox). The empty `<span>` Tiptap renders next to the checkbox is unstyled. |
| Quote | dropdown, `>`, Ctrl+Shift+B | The tint is hardcoded orange (`rgba(212,85,10,.04)`) while the border uses `--accent`. Everything inside is italic, including lists and code. Right-clicking a quote offers only "Remove quote". |
| Code block | toolbar, three backticks, Ctrl+Alt+C | lowlight adds `hljs-*` classes but no theme is loaded, so code shows in one color. No language picker. `pre-wrap` means long lines wrap, so `overflow-x: auto` never applies. |
| Inline code | backticks, Ctrl+E | Background `rgba(0,0,0,.06)` is invisible in dark mode. No toolbar or menu entry, so not reachable on mobile. |
| Divider | toolbar, `---` | Gradient at opacity 0.4 is faint. No `.ProseMirror-selectednode` style anywhere, so a selected divider, footnote or mention shows nothing. |
| Table | toolbar picker, context menu | Our `min-width: 80px` loses to the prosemirror-tables rule. The drag handle sits over the first cell's text. Cell selection tint is hardcoded orange. No row or column actions in the menu. Handle is hover only, so it does not work on touch. |
| Image | toolbar, context menu, paste, drop | Caption is 13 px fixed and ignores zoom. Rich paste bug fixed in step 2. |
| File attachment | toolbar, context menu, paste, drop | Download pill `#FFF6F2` / `#F5D5C8` / `#D4550A` and the selected border are hardcoded, so dark mode shows cream. Fixed px font sizes. |
| Voice memo | toolbar, context menu | Overflow on phones fixed in step 2. Orange hardcoded throughout. Radius 14 against 12 on attachments. |
| Footnote | toolbar, context menu | Double raise fixed in step 2. No list of footnotes at the end of the note. The popover can clip at screen edges on a phone. Tint hardcoded. |
| Poll | toolbar, context menu | Fixed px sizes everywhere. Hardcoded orange tints next to `var(--accent)`. 1.5 px border against 1 px elsewhere. |
| Comment highlight | toolbar Comments, floating bubble, context menu | Yellow, can be mistaken for Highlight. No dark or theme variant. The bubble does not show on touch. |
| @mention, #note mention | `@`, `#` | Chips ignore `--accent`. Dark colors are keyed to `.dark` only, so Synthwave and Midnight get the light chip. `#` at line start fixed in step 2. |
| Alignment | toolbar, Ctrl+Shift+L, E, R, J | Justify works by shortcut but has no button. Does not apply to quotes or code. |
| Lorem ipsum | Shift+Tab in a paragraph, context menu | The hint appears on every empty paragraph after the first, in a low-contrast hardcoded gray. Shift+Tab in a heading, quote or code block is swallowed. The menu inserts a different, shorter text. |
| Paste as plain text | Ctrl/Cmd+Shift+V, context menu Paste | Fixed in step 2. |

Hardcoded light or orange values to move onto theme variables in step 2:
- In `app/globals.css`: inline code, the quote tint, table cell selection, the footnote and poll tints, the comment highlight, the tooltip key color.
- In `components/Toolbar.tsx`: dropdowns (`bg-white border-[#E5E0D8]` at about lines 218, 259, 292 and 353), Unset buttons (`#F5F0E8`), and the text-style button (`text-[#6b6b6b] hover:bg-[#F5F2ED]`).
- In `components/toolbar/parts.tsx`: TBtn colors and the orange active dot (about lines 124 to 140).
- Elsewhere: `LinkPopover.tsx`, `FileAttachmentView.tsx`, and `ColorPicker.tsx` (around lines 285 to 305 and 456 to 592).
- Dead CSS to delete: `.toolbar-btn` is unused, and `.ProseMirror-dropcursor` is declared twice.

## 3. List spacing research

Every good system uses three separate gaps: line height inside an item, a small gap between items, and a larger gap around the list block. Cramped lists come from having only one value.

| Property | Value | Source |
|---|---|---|
| Line height | 1.6 to 1.75, higher for monospace | Tailwind prose 1.75, GitHub 1.5, Butterick 1.2 to 1.45 as a floor |
| Item gap | 0.25 to 0.5em | GitHub `li + li { margin-top: .25em }`, Tailwind `li { margin: .5em 0 }`, Obsidian 0.075em (dense) |
| List margin | 1 to 1.25em, equal to the paragraph gap | Tailwind 1.25em, GitHub 16 px |
| Indent | about 1.6 to 2em, hanging so wrapped lines align with the text | Tailwind 1.625em, GitHub 2em |
| Nested list | 0 to 0.25em above and below, same indent step | GitHub `ul ul { margin: 0 }`, Tailwind 0.75em |
| `li > p` | 0 in tight lists | CommonMark tight lists |
| Markers | muted, bullets lighter than numbers, slightly smaller than text | Tailwind slate-300 bullets, slate-500 numbers; Butterick |
| Task lists | flex, checkbox about 1em, centered on the first line, no bullet | GitHub `.task-list-item` |

Notion's 2026 design notes describe the same model as a neighbor rule: a list item next to another list item gets less padding, so lists group while paragraphs keep their larger break. Tiptap ships no list styling, so browser defaults are what most Tiptap editors show.

## 4. Styling of every other format (other editors)

| Element | Recommended | Sources |
|---|---|---|
| Body | 16 px, line height 1.5 to 1.75, 65 to 75 characters | Tailwind prose, GitHub, Notion (via react-notion-x), Medium |
| Paragraph gap | 0.75 to 1.25em | Tailwind 1.25em, GitHub 16 px below, Obsidian 1rem |
| H1 | 1.875 to 2.25em, line height 1.1 to 1.25 | Tailwind 2.25em, Notion 1.875em, GitHub 2em |
| H2 | 1.5em, line height 1.3, 2em above, 1em below | Tailwind |
| H3 | 1.25em, line height 1.4 to 1.6, 1.6em above, 0.6em below | Tailwind |
| Heading ratio | space above 2 to 4 times space below; zero the top margin of the block after a heading | Tailwind, Obsidian |
| Weight | 600 for H2 and H3, 700 to 800 for H1 | Tailwind, GitHub |
| Quote | 3 to 4 px neutral left border, about 1em padding, muted text, not italic for notes | GitHub; Tailwind uses italic (editorial); Notion 3 px border |
| Code block | light gray background, 1em padding, 6 to 8 px radius, 0.85 to 0.875em text, line height 1.45 to 1.7 | GitHub, Tailwind, Notion |
| Inline code | 0.85em, padding 0.2em 0.4em, radius 4 to 6 px, translucent gray | GitHub, Notion |
| Divider | 1 px line, 2 to 3em above and below | Tailwind 3em, GitHub 1.5rem |
| Table | cell padding 6 to 8 by 8 to 13 px, 1 px borders, optional zebra rows, 0.875em text | GitHub, Notion, Tailwind |
| Checked task | strikethrough, muted, filled checkbox | Notion, GitHub |
| Highlight | pastel background, text keeps its color; a separate darker set for dark mode | Notion, GitHub `mark` |
| Link | accent color and underline, offset about 0.2em, thin at rest | Tailwind, GitHub |
| Mention chip | inline, padding 0.1 to 0.3em, radius 4 to 6 px, tinted background, weight 500, keeps `@` or `#` | convention |
| Image | 2em above and below, radius 6 to 8 px | Tailwind |
| Footnote | sup at 0.75em, line height 0 | convention |

Accessibility rules: body text and muted text at least 4.5:1, borders, checkboxes and chips at least 3:1 (WCAG 1.4.3, 1.4.11). Never color alone (1.4.1): links keep an underline, done items keep the strike, mentions keep their prefix. Layout must survive 1.5 line height and 2x paragraph spacing set by the user (1.4.12), so spacing uses em. Opacity on gray text fails contrast; use a muted color instead.

## 5. Text display research

At 16 px DM Mono is 9.6 px a character, so the old 833 px column held about 87 characters (above WCAG 1.4.8's 80 and Baymard's 50 to 75) and the phone column about 27 (below Butterick's 45).

| Topic | Finding |
|---|---|
| Column | `max-width: 68ch`, about 650 px in DM Mono; sans and serif fit 75 to 80 real characters at the same setting. Butterick 45 to 90, Baymard 50 to 75, WCAG 80. |
| Mono for prose | Mansfield, Legge and Bane (1996): normal-vision readers were about 5% faster in Times than Courier; low-vision readers were about 10% faster in Courier. Butterick says monospace is for code. iA built the semi-proportional Duospace for writing. The difference is small, so keep DM Mono as the brand default; line length matters more. |
| Line height | 1.6 for mono on desktop, 1.5 for sans and serif, never under 1.5 (WCAG 1.4.8). |
| Paragraphs | Space, not indents. Shift+Enter is the plain line break. |
| Phone | Keep 16 px (iOS zooms inputs under 16 px). Padding 16 px under 640 px, 32 px up to 1024 px, 48 px above, and `max(16px, env(safe-area-inset-left))` for the notch. |
| Dark mode | Current `.dark` is `#e2e2f0` on `#13131f` (14.35:1), slightly harsh. Material suggests about `#121212` and 87% white. Suggested `#16161f` background and `#d4d4dc` text (12.19:1). `-webkit-font-smoothing: antialiased` in dark themes on macOS. |
| Contrast now | Body text passes in every theme (9.5 to 17.4:1). Placeholder and muted fail: Default `#C4BFB6` about 1.8:1, Calm 2.08, Earth 1.60, Midnight 2.83. Suggested: Default about `#76706a`, Dark `#8888a8` (5.38:1), Midnight `#6b7f99` (4.42:1, a touch lighter still). The orange `#D4550A` on white is 4.12:1, so it fails AA for body-size links. |
| APCA | Lc 75 minimum for body text, Lc 90 preferred; it also warns against very high contrast in dark mode. |
| Wrapping | `text-wrap: balance` on headings, `pretty` on paragraphs (both added in step 1). Hyphenation off, or only under 640 px with a correct `lang`. |
| Spell check | The browser's checker and `extensions/spell-check.ts` both run. Keep ours, set `spellcheck="false"`, thin wavy underline at about 60% opacity, hidden while typing in a word. |
| Selection and caret | `::selection` at about 25% accent, `caret-color: var(--accent)`. |

Theme tokens are in `app/globals.css` lines 37 to 104 (the `.dark` block starts near line 58); font and theme options are in `components/AppearanceModal.tsx` lines 21 to 33. Fonts on offer: Sans, Serif (Georgia), Mono (DM Mono), Comic. Themes: default, calm, synthwave, earth, barrapad, midnight, plus `.dark`.

## 6. Calm UI research

Principles:
- Calm technology (Weiser and Brown 1995; Amber Case): information sits at the edge of attention and only comes forward when needed.
- Interruptions cost a lot. Gloria Mark measured about 23 minutes to get back to an interrupted task, a figure that includes time spent on other work.
- A single red badge is enough to draw a user's first click (Bartoli and Benedetto, PLoS ONE 2022).
- Hick's law, and progressive disclosure (NN/g).
- iA Writer's focus mode, and Medium's toolbar that appears only on selection.
- Material's calm dark theme.
- Motion between 100 and 500 ms, kept under 300 ms unless there is a reason.
- The claim that red primes avoidance did not replicate, so the case for less orange is about competing for attention, not color psychology.

Recommendations for barraPAD, by impact:
1. The red "9+" badge becomes a quiet dot, with no count.
2. Hide most of the 25-icon toolbar. Use a bar on selection and a `/` menu, with at most about five icons at rest.
3. The guest "Saved on this device only / Sign up to sync" bar becomes a small gray "Local" label by the save status. Show the sign-up prompt once, after the first real edit or on Share. The bar also has a stray second close button at the far right.
4. Orange once per screen: caret, selection and one main action. Make the card border neutral at about 8% opacity, or remove it as iA Writer and Bear do.
5. Fix dark mode as listed above, with one desaturated accent.
6. Remove the floating info icon, and move note info into the existing "?" or the context menu.
7. The 68ch column (done in step 1). On phones, remove the card frame and use a 16 px gutter.
8. "Shared with me" becomes a plain heading, shown only when something is shared.
9. The black Save button becomes a quiet "Saved" status; Export and Share become plain text buttons.
10. Remove the gradient band under the card.
11. Offer a proportional "comfortable" text option alongside DM Mono.
12. Focus mode.
13. Motion: fades of 150 to 250 ms, no bounce, respect `prefers-reduced-motion`, no sounds.

The cheapest wins with the most effect are 1, 3, 4 and 5.

## 7. New UI and UX ideas

| Rank | Idea | Effort | Notes |
|---|---|---|---|
| 1 | Slash menu plus markdown shortcuts | S | Tiptap Suggestion utility. `/poll`, `/tag`, `/table`. Linear, Notion and Craft do this. |
| 2 | Selection formatting bar | S | Tiptap BubbleMenu with bold, italic, link, highlight, color and comment. The user wants to see this first. Keep the top toolbar so the two can be compared. |
| 3 | Quiet save status in place of the Save button | S | Google Docs, Notion, Apple Notes. "Saved", "Local only" for guests. |
| 4 | Mobile toolbar pinned above the keyboard | M | `visualViewport` resize and scroll; test on a real iPhone. Craft, Apple Notes. |
| 5 | Command palette | M | `cmdk` with notes, tags and actions. Ctrl+K is the link shortcut now, so use another key such as Ctrl+P or Ctrl+/. |
| 6 | Presence avatars that jump to a collaborator's caret | S to M | Figma follow, Google Docs. The room already has caret positions. |
| 7 | Collapsible headings | S to M | Apple Notes since iOS 18. Fold state per person, not shared. |
| 8 | Focus and typewriter mode | S | iA Writer. They advise it for drafting only. |
| 9 | A first note that teaches by example | S | Kept in localStorage for guests. Craft, Notion, Bear. |
| 10 | Block drag handle | M | `@tiptap/extension-drag-handle-react` (MIT). The ready-made menu is a paid Tiptap plan. |
| 11 | Replace the spell checker | M | Asked for by the user on 2026-10-17. The current nspell check (`utils/spellcheck`, `extensions/spell-check.ts`) is not accurate: it flags real words and its suggestions are poor. Replace it fully, but keep the look and flow of the custom right-click menu, where suggestions sit at the top when you right-click a misspelled word. Options to research: a better Hunspell dictionary set (en_US plus en_GB, a larger word list), a WASM Hunspell or SymSpell build for suggestions, LanguageTool (self-hosted or API, which also checks grammar), or letting the browser decide which words are wrong and only drawing our own menu. A user dictionary ("Add to dictionary") belongs with it. |

Skipped on purpose: Bear-style syntax shown at the cursor (barraPAD is rich text), and AI writing features (no AI in the app). The research could not confirm a Notion 2026 page redesign beyond a third-party post.

Suggested order inside step 4: selection bar first (user request), then the quiet save status, the slash menu, the first note for guests, focus mode, the mobile keyboard toolbar, presence avatars, the command palette, collapsible headings, the drag handle, and the spell checker replacement.

## Sources

- Tailwind Typography: https://github.com/tailwindlabs/tailwindcss-typography/blob/main/src/styles.js
- GitHub Markdown CSS: https://github.com/sindresorhus/github-markdown-css
- Notion page design: https://www.notion.com/blog/updating-the-design-of-notion-pages
- Notion's CSS via react-notion-x: https://github.com/NotionX/react-notion-x/blob/master/packages/react-notion-x/src/styles.css
- Obsidian list variables: https://raw.githubusercontent.com/obsidianmd/obsidian-developer-docs/main/en/Reference/CSS%20variables/Editor/List.md
- CommonMark tight lists: https://spec.commonmark.org/0.31.2/
- Butterick: https://practicaltypography.com/line-length.html, https://practicaltypography.com/line-spacing.html, https://practicaltypography.com/space-between-paragraphs.html, https://practicaltypography.com/bulleted-and-numbered-lists.html, https://practicaltypography.com/monospaced-fonts.html
- Baymard: https://baymard.com/blog/line-length-readability
- WCAG: https://www.w3.org/WAI/WCAG21/Understanding/visual-presentation.html, https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html
- APCA: https://git.apcacontrast.com/documentation/APCA_in_a_Nutshell
- Material dark theme: https://m2.material.io/design/color/dark-theme
- Material type scale: https://m3.material.io/styles/typography/type-scale-tokens
- Dark mode and halation: https://www.smashingmagazine.com/2020/04/dark-mode-accessibility-myth-debunked/, https://www.nngroup.com/articles/dark-mode/
- text-wrap: https://developer.chrome.com/docs/css-ui/css-text-wrap-balance, https://developer.chrome.com/blog/css-text-wrap-pretty
- Mansfield, Legge and Bane: https://legge.dl8.umn.edu/sites/legge.psych.umn.edu/files/files/media/mansfield96_psychophysics_of_reading_xv-_font_effects_in_normal_and_low_vision.pdf
- iA: https://ia.net/topics/in-search-of-the-perfect-writing-font, https://ia.net/writer/support/editor/focus-mode
- Calm technology: https://calmtech.com/papers/designing-calm-technology, https://www.calmtech.institute/calm-tech-principles
- Badge study: https://doaj.org/article/51b7058d47b9488c86983e150ef8b35e
- Hick's law: https://lawsofux.com/hicks-law/; progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- Motion: https://design-system.lib.umich.edu/visual-elements/motion
- Linear editor: https://linear.app/changelog/2023-12-06-editor-improvements
- Tiptap: https://tiptap.dev/docs/editor/extensions/functionality/drag-handle, https://tiptap.dev/docs/ui-components/components/drag-context-menu
- Apple Notes iOS 18: https://www.macrumors.com/guide/ios-18-notes-app
- Figma follow: https://help.figma.com/hc/en-us/articles/360040322673-Present-to-collaborators-using-spotlight
- Mobile keyboard toolbar: https://blog.crypt.ee/mobile-sidebar-updates/
