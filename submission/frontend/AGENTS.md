<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Frontend only: all backend access goes through src/services/anonymizer.ts (VITE_API_URL or built-in mock) — the LLM backend is built separately by the team.
- Masking is done deterministically in the frontend from the entity list, so manual review edits apply before output.
- Manual review observes selectionchange within the document and supports touch selection, so mobile selection handles work without mouse events.
- The settings React context is created once and cached on globalThis, and useSettings falls back to stored settings when no provider is found, so a hot reload of the settings module can never blank the page.
- Render the intro overlay in the initial HTML and start its river animation without a delay; check session history after hydration so the first visit never flashes the UI before the logo.
- Keep interface translations in the shared language dictionaries; analysis text from the external service remains document content, not interface copy.
- Keep review changes in a page-owned undo/redo reducer so entity toggles, category changes and manual additions share one history.
- Manual selection actions use a virtual Range anchor on desktop and a nonmodal bottom sheet on touch devices to avoid shifting document text.
- Below the desktop review breakpoint, keep entity controls in a bottom sheet and page actions fixed above the safe area so long documents do not bury navigation.
- Comparison masking is display-only, preserving original whitespace and token widths for alignment; copy and downloads always use the official anonymize output.
- Keep document import, loading and comparison as focused frontend components; accept page-wide file drops without intercepting text selection drops.
- Browser storage is read and written only through src/lib/safe-storage.ts, and the opening overlay hides itself even when storage or media queries are refused, so a browser that blocks storage (Safari in an embedded frame, private mode) can never blank the page.
