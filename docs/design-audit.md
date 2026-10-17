# Editor design audit (2026-10-17)

This audit came from seven research passes run on 2026-10-17. Four were web research: list spacing, how other editors style each format, calm interface design, and new UI/UX ideas from other writing apps. One was a text display study. Two looked at barraPAD itself: a code audit of every format, and a visual audit that measured the live site at desktop and phone sizes in light and dark mode. Nothing here has been built yet. Each finding gives its source, and the plan at the end is the proposed order of work.

## What is wrong today

### Spacing has no system

Tailwind's base stylesheet sets the margin of every paragraph, list and heading to zero, and the editor only adds margins back for some blocks. Measured on the live site:

| Gap | Now |
|---|---|
| Paragraph to paragraph | 0 |
| Paragraph to a list after it | 0 |
| Between list items | 0 (the same as between wrapped lines inside one item) |
| Heading above and below | equal (H1 16/16, H2 12/12, H3 10/10 px) |
| Code block, table | 8 px |
| Quote | 12 px |
| Divider | 24 px |
| Image | 2 px |
| Attachment | 4 px |
| Poll | 12 px, fixed, ignores zoom |

Because items and wrapped lines are 0 px apart, the bullet is the only thing that tells one list item from the next. On a phone, a long item wraps to eight or nine lines, so the next bullet is easy to miss. That matches the screenshot that prompted this audit.

### Text column

At 16 px, DM Mono is 9.6 px a character, so the 833 px desktop column holds about 87 characters a line. That is above the 80 limit in WCAG 1.4.8 and the 50 to 75 range Baymard recommends. On a 390 px phone the column is 259 px, about 27 characters, because the card border and two layers of 32 px padding use a third of the screen. The info icon to the left of the card is cut in half at the screen edge.

### Bugs found while auditing

| Bug | Where |
|---|---|
| Pasting rich HTML that contains an image drops all of its text | `components/NoteEditorCore.tsx:427` |
| A bullet or numbered list nested in a checklist item loses its markers | `app/globals.css:202` |
| Checking a checklist item strikes and fades its unchecked children too | `app/globals.css:211` |
| The footnote marker is raised twice (`sup` plus `vertical-align: super`) | `app/globals.css:263` |
| Paste as plain text joins every line into one paragraph and reads `<b>` as markup | `components/NoteEditorCore.tsx:366` |
| `#` at the start of a line opens the note picker before it can become a heading | `extensions/note-mention.tsx:19` |
| Link and Underline are registered twice; the second Link setup (`openOnClick: false`) probably does not apply | `components/NoteEditorCore.tsx:292` |
| Voice memo player is wider (260 px minimum) than a phone's text column (about 244 px) | `components/FileAttachmentView.tsx:137` |
| Code blocks load syntax highlighting but no color theme, so code shows in one color | `components/NoteEditorCore.tsx:305` |
| DM Mono is loaded only at weights 300 to 500, so bold, H1 and H2 are drawn as fake bold by the browser | `app/globals.css:1` |
| H4 to H6 can be made with `####` or Ctrl+Alt+4 but have no style | StarterKit defaults |
| Two spell checkers run at once (the browser's and ours), which can double the underlines | `extensions/spell-check.ts` |
| The placeholder text color is 1.6:1 to 2.8:1 against the page in every theme; text needs 4.5:1 | `app/globals.css:37-104` |

### Dark mode and themes

Many colors are fixed hex values instead of theme variables, so they ignore dark mode and the Synthwave and Midnight themes:
- Inline code has no visible background, so it looks like plain text.
- Highlighted text is light text on a pale yellow background, which is close to unreadable.
- The link box, toolbar dropdowns, attachment and voice memo cards, and the color picker stay white or cream.
- The quote and table selection tints stay orange while the accent turns purple, so the colors mix.
- Mention chips use the light colors in Synthwave and Midnight.
- The selected note title in the sidebar is close to invisible, and the search field is a light gray block.

## What good looks like

The research agrees on a small set of rules:
- Use three different gaps, not one. Line height inside a block is the smallest. The gap between list items is next, about 0.25 to 0.5 em. The gap around a block (a paragraph, a whole list, a quote) is about 1 em. Items should be about a third or a quarter as far apart as blocks, so a list reads as one group. (Tailwind Typography, GitHub's Markdown CSS, Notion's page design notes.)
- A heading sits closer to the text it introduces than to the text above it. Space above is two to three times the space below. (Tailwind: H2 has 2 em above and 1 em below; Obsidian uses 2.5 times.)
- Keep lines between 45 and 80 characters. Line height should be at least 1.5, and about 1.6 to 1.7 for a monospace font, which looks dense. (Butterick, Baymard, WCAG 1.4.8.)
- Supporting blocks step back and body text stays at full contrast. Quotes, code, checked items and footnotes get a muted color, a light background or a smaller size, and still meet 4.5:1 contrast. Every state has two signals, such as color plus underline, or color plus strikethrough. (WCAG 1.4.1, 1.4.3, 1.4.11.)
- Calm comes from fewer things asking for attention, not from a particular color. A red number badge reliably draws the first click (Bartoli and Benedetto, 2022). The orange accent is used in about eight places on one screen, and the ideal is one main action.

## Proposed values

| Element | Value |
|---|---|
| Body line height | 1.65 (DM Mono), 1.5 (sans and serif) |
| Paragraph after paragraph | 0.6 em above |
| List block | 0.6 em above and below, padding-left 1.6 em |
| List item after item | 0.3 em above |
| Paragraph inside a list item | 0 |
| Nested list | 0.3 em above, 0 below |
| List markers | muted color, about 55% contrast; nested bullets change shape (disc, circle, square) and numbers change style (1, a, i) |
| Checklist | same indent as bullets; checkbox centered on the first line and using the accent color; a checked item is struck and muted, and its children are not |
| H1, H2, H3 | 1.2 em, 1 em and 0.9 em above; 0.4 em, 0.35 em and 0.3 em below; `text-wrap: balance`; no top margin when it is the first block |
| Quote, code block, table, image, attachment, poll | 0.8 em above and below, one value for all |
| Divider | 1.2 em above and below |
| Text column | max-width 68 ch, centered |
| Side padding | 16 px under 640 px wide, 32 px up to 1024 px, 48 px above |
| Dark theme | background `#16161f`, text `#d4d4dc`, desaturated accent, highlight at about 25% opacity |
| Muted and placeholder text | at least 4.5:1 in every theme |

The paragraph gap changes how existing notes look. Notes where people pressed Enter twice between paragraphs will show a slightly larger gap. Shift+Enter still makes a line break with no gap.

## New ideas, ranked by value for effort

| Idea | Effort | Note |
|---|---|---|
| Replace the Save button with a quiet "Saved" or "Local only" status | S | The app saves on its own; a Save button makes people wonder whether it did |
| Slash menu (`/`) on an empty line for blocks | S | Tiptap's Suggestion utility already ships with the editor |
| Formatting bubble on selected text | S | Tiptap's BubbleMenu; it would retire most of the 25-button toolbar |
| A first note for new guests that teaches by example | S | Kept in localStorage, so no server cost |
| Focus mode: hide the chrome and dim every paragraph but the current one | S | iA Writer |
| Quieter notifications: a dot instead of a red "9+" | S | Calm design research |
| Mobile toolbar pinned above the keyboard | M | `visualViewport`; needs testing on a real iPhone |
| Command palette on Ctrl+K | M | Ctrl+K is the link shortcut today, so this needs another key |
| Presence avatars that jump to a collaborator's caret | S to M | The room already knows where each caret is |
| Collapsible headings | S to M | Folding is kept per person, not shared |
| Drag handle for blocks | M | Lowest value for a notepad |

## Proposed order

The first phase is spacing and rhythm, which is the problem the user raised: the values above, the 68 ch column, the mobile padding, and the list and checklist fixes. The second phase is the bugs table, plus dark mode and theme colors moved onto variables. The third phase is calm: the quiet save status, a single orange accent, a quieter badge and guest pill, and removing the info icon and the gradient band. The fourth phase is the new ideas, in the order in the table. Each phase ships separately with screenshots before and after, a Playwright check, and updates to `docs/spec.md`.

## Sources

Tailwind Typography styles: https://github.com/tailwindlabs/tailwindcss-typography/blob/main/src/styles.js. GitHub Markdown CSS: https://github.com/sindresorhus/github-markdown-css. Notion page design: https://www.notion.com/blog/updating-the-design-of-notion-pages. Butterick on line length, line spacing, paragraph spacing and lists: https://practicaltypography.com. Baymard on line length: https://baymard.com/blog/line-length-readability. WCAG 1.4.8 and 1.4.12: https://www.w3.org/WAI/WCAG21/Understanding/. Material dark theme: https://m2.material.io/design/color/dark-theme. Calm technology: https://calmtech.com/papers/designing-calm-technology. Badge study: https://doaj.org/article/51b7058d47b9488c86983e150ef8b35e. iA Writer focus mode: https://ia.net/writer/support/editor/focus-mode. Mansfield, Legge and Bane on monospace reading speed: https://legge.dl8.umn.edu/sites/legge.psych.umn.edu/files/files/media/mansfield96_psychophysics_of_reading_xv-_font_effects_in_normal_and_low_vision.pdf. Tiptap drag handle: https://tiptap.dev/docs/editor/extensions/functionality/drag-handle.
