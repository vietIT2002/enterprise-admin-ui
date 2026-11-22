# r05 — no skill, P1 ("Improve this app's UI.")
- Shared styles.css replacing 5 inline style blocks; CSS variables, one blue accent; removed purple/pink gradients, glassmorphism, heavy shadows, oversized radii.
- Tables: muted header, hover rows, numeric right-aligned. Status badges: one scheme across pages.
- Focus-visible outlines; <900px sidebar → top bar, KPI 2 cols, cards scroll.
- Removed: greeting heroes (employees "Chào buổi sáng, Hoa! 👋", leave-requests "Good morning, Hoa! 🌞"), fake chart + notices on 4 pages, team cards, tip box, fake KPI deltas, emoji everywhere, decorative empty-state SVG.
- Same header structure everywhere (title+subtitle left, action right). Timesheets summary into 6-col grid. Timesheets pager right-aligned. Reports bars un-nested.
- Did NOT open in a browser; checked by grep only. Claims IDs/classes/behaviour unchanged (pagination kinds not unified — only pager alignment touched).
