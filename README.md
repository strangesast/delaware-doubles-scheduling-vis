# Delaware Doubles — first-game scheduling

Interactive visualizations of how a doubles volleyball league orders its first games.

**Live:** https://strangesast.github.io/delaware-doubles-scheduling-vis/

Each pool of teams forms a ring where every team plays its two neighbours. You pick who plays
whom first; since a team can only play one game at a time, the picks form a *matching*. With an
odd-sized pool one team always has to wait — these pages explore ways to reduce and share that wait.

## Pages

- **[Demo](https://strangesast.github.io/delaware-doubles-scheduling-vis/cascade.html)** — a sandbox ring:
  change the team count, click links to pair teams, optionally split into rings of 4+.
- **[Real schedule](https://strangesast.github.io/delaware-doubles-scheduling-vis/schedule.html)** — the real
  three pools of nine, with two composable hypotheticals: split each division into rings of 4+, and
  reorganize into optimal even groups (sizes prefer multiples of 4, so a group of 8 → two clean rings of 4).

## Files

| File | What it is |
| --- | --- |
| `index.html` | Landing page |
| `cascade.html` | Demo ring (variable team count, optional split) |
| `schedule.html` | The real schedule + the two hypotheticals |
| `ring.js` | Shared ring-graph logic (d3): drawing, links, grouping helpers |
| `ring.css` | Shared styles |
| `observable.md` | Paste-ready guide for rebuilding the same thing as an Observable notebook |

Built with [d3](https://d3js.org/). No build step — open the HTML files directly, or serve the folder
with any static server (`python3 -m http.server`).

## How it works

- A team's two scheduled opponents are its ring neighbours. Clicking a team or a link sets its
  *first* game; hover any circle for a "plays X then Y" tooltip.
- `splitGroups(total, target)` breaks a count into rings each ≥ the target, folding the remainder
  into the last (e.g. 10 → `[4, 6]`).
- `evenGroups(total, divisions)` keeps the division count but resizes them toward multiples of 4,
  all even except at most one odd group (e.g. 27 into 3 → `[8, 8, 11]`), so only one team waits.
