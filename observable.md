# Volleyball scheduling — interactive rings

Each pool of teams is shown as a ring where every team plays its two neighbours; you click the
links between teams to choose who plays whom first, and a live table shows the resulting schedule.
Because no team can play two games at once, it's a quick way to see who's up next and who has to wait.

To use it: create a new notebook at https://observablehq.com/new and paste each block below into
its **own cell**. Then click the links between the circles — green means paired, orange means waiting.

---

## Cell 1 — setup

Just run it — this gets things ready to draw.

```js
d3 = require("d3@7")
```

---

## Cell 2 — styling

Controls how the rings look. Just run it — change colors or sizes here if you like.

```js
html`<style>
.vb { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color:#0f172a; }
.vb.wrap { display:flex; gap:22px; justify-content:flex-start; flex-wrap:wrap; padding:8px 0; }
.vb.panel { background:#fff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px 14px 16px; width:360px; box-sizing:border-box; }
.vb.panel.wide { width:600px; }
.vb .cap  { text-align:center; font-weight:700; font-size:15px; }
.vb .cap2 { text-align:center; font-size:12.5px; color:#475569; min-height:18px; margin-top:3px; }
.vb .ctrl { display:flex; align-items:center; justify-content:center; gap:10px; padding:6px 0 2px; font-size:12.5px; color:#334155; }
.vb .ctrl input[type=range] { width:170px; }
.vb svg { display:block; width:100%; height:auto; }
.vb .ring     { stroke:#cbd5e1; stroke-width:3; }
.vb .half     { stroke-width:9; stroke-linecap:round; pointer-events:none; }
.vb .half.pending { stroke:#f97316; }
.vb .half.live    { stroke:#15803d; }
.vb .team-ok  { fill:#22c55e; stroke:#15803d; stroke-width:2; }
.vb .team-out { fill:#f97316; stroke:#c2410c; stroke-width:2; }
.vb .node circle { cursor:pointer; }
.vb .ring.hl  { stroke:#64748b; stroke-width:5; }
.vb .half.hl  { stroke-width:13; }
.vb circle.hl { stroke-width:4.5; }
.vb .subcap   { fill:#475569; font-size:19px; font-weight:600; }   /* sub-ring caption */
.vb .node .tlabel { fill:#fff; font-size:15px; font-weight:700; text-anchor:middle; dominant-baseline:central; }
.vb .node .name   { fill:#1e293b; font-size:11px; font-weight:600; }
</style>`
```

---

## Cell 3 — setup (cont.)

More behind-the-scenes setup for the rings. Just run it — nothing to change here.

```js
makeRing = {
  const MIN = 4, MAX = 16, DEFAULT = 8;
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const lowBits = b => (1 << b) - 1;
  const matchingMask = n => { let m=0; for (let k=0; k+1<n; k+=2) m |= 1<<k; return m; };

  function buildRing(svgSel, opts = {}) {
    const names     = opts.names || null;
    const fixed     = !!names;
    const key       = opts.key;
    const extN      = (!fixed && opts.n != null) ? clamp(opts.n, MIN, MAX) : null;
    const useSlider  = opts.slider !== false && !fixed && extN == null;

    const R     = opts.r ?? 150;                                  // ring radius (override to pack compactly)
    const RNODE = opts.rNode ?? Math.round(R * (fixed ? 16 : 22) / 150);
    const DUR   = 380;

    const saved  = (localStorage.getItem(key) || '').split(':');
    const savedN = fixed ? names.length : clamp(parseInt(saved[0],10) || DEFAULT, MIN, MAX);
    let n    = extN != null ? extN : savedN;
    let mask = (saved[1] !== undefined && saved[1] !== '') ? (+saved[1] & lowBits(savedN)) : matchingMask(savedN);
    if (!fixed && n !== savedN) mask &= lowBits(Math.min(savedN, n) - 1);
    mask &= lowBits(n);
    const save = () => localStorage.setItem(key, `${n}:${mask}`);
    save();

    const labelOf = k => fixed ? names[k] : 'T' + (k+1);
    const currentPairs = () => {
      const out = [];
      for (let k=0; k<n; k++) if ((mask>>k)&1) out.push([labelOf(k), labelOf((k+1)%n)]);
      return out;
    };
    const emit = () => { if (opts.onChange) opts.onChange(currentPairs()); };

    let sliderLabel;
    if (useSlider) {
      const ctrl = d3.select(svgSel.node().parentNode).insert('div','svg').attr('class','ctrl');
      sliderLabel = ctrl.append('label');
      ctrl.append('input').attr('type','range')
        .attr('min',MIN).attr('max',MAX).attr('step',1).attr('value',n)
        .on('input', function() {
          const newN = +this.value;
          mask &= lowBits(Math.min(n, newN) - 1);
          n = newN; save();
          sliderLabel.text(`Teams: ${n}`);
          draw();
          emit();
        });
      sliderLabel.text(`Teams: ${n}`);
    }

    // draw into a caller-positioned group (compact, shared svg) or take over the whole svg
    let root;
    if (opts.cx != null) {
      root = svgSel.append('g').attr('transform', `translate(${opts.cx},${opts.cy})`);
    } else {
      const SIZE = fixed ? 600 : 380;
      root = svgSel.attr('viewBox', `0 0 ${SIZE} ${SIZE}`)
        .append('g').attr('transform', `translate(${SIZE/2},${SIZE/2-4})`);
    }

    function draw() {
      root.selectAll('*').remove();
      const otherOf = k => (k+1)%n;
      const POS = d3.range(n).map(k => {
        const a = -Math.PI/2 + k*2*Math.PI/n;
        return { k, x: R*Math.cos(a), y: R*Math.sin(a), label: labelOf(k) };
      });
      const EDGES = d3.range(n);
      const on = k => (mask >> k) & 1;
      const A = k => POS[k], B = k => POS[otherOf(k)];
      const mid = k => [ (A(k).x+B(k).x)/2, (A(k).y+B(k).y)/2 ];
      const ex1=k=>A(k).x, ey1=k=>A(k).y, ex2=k=>B(k).x, ey2=k=>B(k).y;
      const shown = new Array(n).fill(false);
      const setEdge = e => { mask &= ~(1<<((e-1+n)%n)); mask &= ~(1<<((e+1)%n)); mask |= 1<<e; };

      const ringLines = root.append('g').selectAll('line').data(EDGES).join('line')
        .attr('class','ring').attr('pointer-events','none')
        .attr('x1',ex1).attr('y1',ey1).attr('x2',ex2).attr('y2',ey2);

      const pathLayer = root.append('g');
      const pairs = pathLayer.selectAll('g.pair').data(EDGES).join(enter => {
        const g = enter.append('g').attr('class','pair').style('display','none');
        g.append('line').attr('class','half h1');
        g.append('line').attr('class','half h2');
        return g;
      });
      pairs.each(function(k){
        const a=[A(k).x,A(k).y], b=[B(k).x,B(k).y], g=d3.select(this);
        g.select('.h1').attr('x1',a[0]).attr('y1',a[1]).attr('x2',a[0]).attr('y2',a[1]);
        g.select('.h2').attr('x1',b[0]).attr('y1',b[1]).attr('x2',b[0]).attr('y2',b[1]);
      });

      root.append('g').selectAll('line').data(EDGES).join('line')
        .attr('x1',ex1).attr('y1',ey1).attr('x2',ex2).attr('y2',ey2)
        .attr('stroke','transparent').attr('stroke-width',18).style('cursor','pointer')
        .on('mouseenter', (ev,k) => highlightEdge(k, true))
        .on('mouseleave', (ev,k) => highlightEdge(k, false))
        .on('click', (ev,k) => {
          if (on(k)) mask &= ~(1<<k);            // click a link to toggle it off…
          else setEdge(k);                       // …or on (a team plays at most one other)
          save();
          update(true);
          emit();
        });

      const nodeG = root.append('g').selectAll('g').data(POS).join('g')
        .attr('class','node').attr('transform',d=>`translate(${d.x},${d.y})`);
      const dot = nodeG.append('circle').attr('r',RNODE).classed('team-out', true);
      nodeG.append('title');                                  // hover tooltip (filled in by update)
      if (fixed) {
        nodeG.append('text').attr('class','name').each(function(d){
          const ux=d.x/R, uy=d.y/R, pad=RNODE+9;
          d3.select(this)
            .attr('x', ux*pad).attr('y', uy*pad)
            .attr('text-anchor', ux>0.25 ? 'start' : ux<-0.25 ? 'end' : 'middle')
            .attr('dominant-baseline', uy>0.3 ? 'hanging' : uy<-0.3 ? 'auto' : 'middle')
            .text(d.label);
        });
      } else {
        nodeG.append('text').attr('class','tlabel').text(d=>d.label);
      }
      const colorTeam = (team, live) =>
        dot.filter(d => d.k === team).classed('team-ok', live).classed('team-out', !live);

      // hover tooltip text: who team k plays first, then second (or "either" when unmatched)
      const titleFor = k => {
        const me = labelOf(k), prevT = labelOf((k-1+n)%n), nextT = labelOf((k+1)%n);
        if (on(k))         return `${me} plays ${nextT} THEN ${prevT}`;   // right link set
        if (on((k-1+n)%n)) return `${me} plays ${prevT} THEN ${nextT}`;   // left link set
        return `${me} plays ${nextT} OR ${prevT}`;                        // unmatched
      };

      // click a team to connect one of its two links, then the other; hover highlights the team
      nodeG.style('cursor','pointer')
        .on('click', (ev,d) => {
          const k = d.k, R = k, L = (k-1+n)%n;     // team k's right / left link
          const occupied = j => on(j) || on((j-1+n)%n);
          if (on(R)) setEdge(L);                   // already matched on the right → toggle to the left
          else if (on(L)) setEdge(R);              // already matched on the left  → toggle to the right
          else {                                   // unmatched → take an unoccupied neighbour first
            const rFree = !occupied((k+1)%n), lFree = !occupied((k-1+n)%n);
            setEdge(rFree || !lFree ? R : L);
          }
          save(); update(true); emit();
        })
        .on('mouseenter', (ev,d) => highlightTeam(d.k, true))
        .on('mouseleave', (ev,d) => highlightTeam(d.k, false));

      // hover a link → highlight the link plus both of its teams
      function highlightEdge(k, hl) {
        ringLines.filter(e => e === k).classed('hl', hl);
        pairs.filter(e => e === k).selectAll('.half').classed('hl', hl);
        dot.filter(d => d.k === k || d.k === (k+1)%n).classed('hl', hl);
      }
      // hover a team → highlight it, and (when it's paired) its link + the other team
      function highlightTeam(k, hl) {
        dot.filter(d => d.k === k).classed('hl', hl);
        const e = on(k) ? k : on((k-1+n)%n) ? (k-1+n)%n : -1;
        if (e >= 0) highlightEdge(e, hl);
      }

      function update(animate) {
        pairs.each(function(k){
          const want = !!on(k);
          if (want === shown[k]) return;
          shown[k] = want;
          const g = d3.select(this), h1 = g.select('.h1'), h2 = g.select('.h2');
          const a=[A(k).x,A(k).y], b=[B(k).x,B(k).y], m=mid(k);
          h1.classed('live',false).classed('pending',true);
          h2.classed('live',false).classed('pending',true);

          if (want) {
            g.style('display',null);
            const arrive = (half, team) => { half.classed('pending',false).classed('live',true); colorTeam(team,true); };
            if (animate) {
              const grow = (half, fromPt, team) => {
                const len = Math.hypot(m[0]-fromPt[0], m[1]-fromPt[1]);
                const thr = len > 9 ? 1 - 4.5/len : 1;
                half.interrupt().transition().duration(DUR).ease(d3.easeCubicOut)
                  .attr('x2',m[0]).attr('y2',m[1])
                  .tween('flip', function(){ let done=false; return t => { if (!done && t>=thr) { done=true; arrive(half,team); } }; });
              };
              grow(h1, a, k);
              grow(h2, b, otherOf(k));
            } else {
              h1.interrupt().attr('x2',m[0]).attr('y2',m[1]); arrive(h1,k);
              h2.interrupt().attr('x2',m[0]).attr('y2',m[1]); arrive(h2,otherOf(k));
            }
          } else {
            colorTeam(k,false); colorTeam(otherOf(k),false);
            const hide = () => g.style('display','none');
            if (animate) {
              h1.interrupt().transition().duration(DUR).ease(d3.easeCubicOut).attr('x2',a[0]).attr('y2',a[1]);
              h2.interrupt().transition().duration(DUR).ease(d3.easeCubicOut).attr('x2',b[0]).attr('y2',b[1]).on('end',hide);
            } else {
              h1.interrupt().attr('x2',a[0]).attr('y2',a[1]);
              h2.interrupt().attr('x2',b[0]).attr('y2',b[1]); hide();
            }
          }
        });
        nodeG.select('title').text(d => titleFor(d.k));
      }

      update(false);
    }

    draw();
    emit();
  }

  // Observable wrapper: build a self-contained container node and return it AS A VIEW —
  // node.value holds the current selection and an 'input' event fires whenever it changes,
  // so `viewof ring = makeRing(...)` exposes a live, reactive value.
  function makeRing(opts = {}) {
    const container = d3.create("div").attr("class", "vb panel" + (opts.names ? " wide" : ""));
    if (opts.title)    container.append("div").attr("class","cap").text(opts.title);
    if (opts.subtitle) container.append("div").attr("class","cap2").text(opts.subtitle);
    container.append("svg");
    const node = container.node();
    buildRing(container.select("svg"), Object.assign({}, opts, {
      onChange: pairs => {
        const playing = new Set(pairs.flat());
        const waiting = (opts.names || []).filter(t => !playing.has(t));
        node.value = { title: opts.title, pairs, waiting };
        node.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }));
    return node;
  }
  makeRing.buildRing = buildRing;   // expose the lower-level builder for compact packing
  return makeRing;
}
```

And one tiny helper (its own cell) that breaks a total number of teams into rings — each at
least the target size, with any leftover folded into the last ring (10 with target 4 → 4 and 6):

```js
splitGroups = (total, target) => {
  const g = Math.max(1, Math.floor(total / target));
  return Array.from({ length: g }, (_, i) => i < g - 1 ? target : total - target * (g - 1));
}
```

And one for the "optimal" reorganization — keep the same number of `divisions`, but resize them
preferring multiples of 4 (so most groups pair off cleanly), with the leftover carrying the
remainder. Every group is at least 4. e.g. 27 into 3 → `[8, 8, 11]`:

```js
evenGroups = (total, divisions) => {
  const D = Math.max(1, Math.min(divisions, Math.floor(total / 4)));
  let base = Math.max(4, 4 * Math.round(total / D / 4));
  while (D > 1 && total - base * (D - 1) < 4) base -= 4;
  return Array.from({ length: D }, (_, i) => i < D - 1 ? base : total - base * (D - 1));
}
```

---

## Cell 4 — team count

Choose how many teams are in the practice ring below.

```js
viewof teams = Inputs.range(
  [4, 16],
  { step: 1, label: "Teams",
    value: Math.min(16, Math.max(4, +((localStorage.getItem("vb.ring") || "").split(":")[0]) || 8)) }
)
```

---

## Cell 5 — practice ring

A ring to get a feel for it. Click the links between teams to pair them up, and use the slider
above to add or remove teams. Tick the box to split everyone into separate rings (each at least 4),
the way the real pools work. Your changes are saved automatically. _(Paste each block as its own cell.)_

```js
viewof split = Inputs.toggle({ label: "Split into rings of 4+", value: true })
```
```js
demo = {
  if (!split)
    return makeRing({ key: "vb.ring", n: teams, slider: false, title: `Demo Ring (${teams} teams)` });
  const wrap = d3.create("div").attr("class", "vb wrap");
  splitGroups(teams, 4).forEach((size, i) =>
    wrap.node().appendChild(
      makeRing({ key: `vb.ring.${i}`, n: size, slider: false, title: `Ring ${i + 1} (${size} teams)` })
    )
  );
  return wrap.node();
}
```

---

## Cell 6 — the schedule

The league: every team, which pool it's in, and the two teams it plays. Edit the lineups here
and everything below keeps up.

```js
schedule = [
  ["Pool 1", ["Gina/Chris","Angelene Belle/Nick","Carly/Alex","Michele/Justin","Laura/Jeff","Julie/Thom","Angela/Justin","Molly/Chris","Brittany/Shane"]],
  ["Pool 2", ["Ashley/Dylan","Lauren/Greg","Haley/Anthony","Lindsay/Calvin","Kayla/Josh","Zoey/Shawn","Viktorija/Matt","Tori/Larry","Kaylee/Sam"]],
  ["Pool 3", ["Jakki/Caan","Molly/Ryan","Sara/Shaun","Caitlyn/Joshua","Madi/Troy","Sofia/Jordan","Hannah/Taylor","Rebecca/Bryan","Sophia/Damian"]],
].flatMap(([pool, teams]) => teams.map((team, order) => ({
  pool, order, team,
  plays: [teams[(order + teams.length - 1) % teams.length], teams[(order + 1) % teams.length]],
})))
```

---

## Cell 7 — the pools

Each pool shown as a ring; click the links to choose who plays first. Two optional hypotheticals
that **compose**: "optimal" picks the divisions (reorganized into even groups, multiples of 4
preferred), and "split" decides whether each division is broken into rings of 4+. With both on,
e.g. 8 → two rings of 4 and 11 → a 4 and a 7. _(Paste each block as its own cell.)_

```js
viewof hypothetical = Inputs.toggle({ label: "Split each division into rings of 4+ (hypothetical)", value: false })
```
```js
viewof optimal = Inputs.toggle({ label: "Reorganize into optimal even groups (hypothetical)", value: false })
```
```js
viewof pools = {
  const root = d3.create("div").attr("class", "vb");
  const node = root.node();
  const titles = [...new Set(schedule.map(d => d.pool))];
  const byPool = t => schedule.filter(d => d.pool === t).sort((a, b) => a.order - b.order).map(d => d.team);
  const all = titles.flatMap(byPool);
  const slices = (names, sizes) => { let i = 0; return sizes.map(s => names.slice(i, i += s)); };

  const order = [], values = new Map();
  const sync = () => { node.value = order.map(id => values.get(id)); node.dispatchEvent(new Event("input", { bubbles: true })); };
  const mount = (svg, { id, key, names, cx, cy, r }) => {
    order.push(id);
    makeRing.buildRing(svg, { key, names, slider: false, cx, cy, r,
      onChange: pairs => {
        const playing = new Set(pairs.flat());
        values.set(id, { title: id, names, pairs, waiting: names.filter(t => !playing.has(t)) });
        sync();
      } });
  };
  // pack a list of groups into one panel's svg as a d3 grid of rings
  const packRings = (parent, title, groups, keyPrefix, cols) => {
    const n = groups.length;
    cols = cols || Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const R = 105, slotW = 2 * R + 250, slotH = 2 * R + 96, W = slotW * cols, H = slotH * rows;
    const panel = parent.append("div").attr("class", "vb panel").style("width", Math.min(1040, 320 * cols) + "px");
    if (title) panel.append("div").attr("class", "cap").text(title);
    const svg = panel.append("svg").attr("viewBox", `0 0 ${W} ${H}`);
    const x = d3.scaleBand().domain(d3.range(cols)).range([0, W]);
    const y = d3.scaleBand().domain(d3.range(rows)).range([0, H]);
    groups.forEach((names, i) => {
      const cx = x(i % cols) + x.bandwidth() / 2, top = y(Math.floor(i / cols)), size = names.length;
      svg.append("text").attr("class", "subcap").attr("x", cx).attr("y", top + 26).attr("text-anchor", "middle")
         .text(`${size} teams${size % 2 ? " · one waits" : " · nobody waits"}`);
      mount(svg, { id: `${keyPrefix}#${i}`, key: `${keyPrefix}.${i}`, names, cx, cy: top + slotH / 2 + 14, r: R });
    });
  };

  // "optimal" chooses the divisions; "hypothetical" decides whether each is broken into rings of 4+
  const divisions = optimal
    ? slices(all, evenGroups(all.length, titles.length)).map((names, i) =>
        ({ title: `Group ${i + 1} · ${names.length} teams`, names, key: `vb.opt.${i}`, subKey: `vb.optsub.${i}` }))
    : titles.map((t, i) => ({ title: t, names: byPool(t), key: `vb.pool.${t}`, subKey: `vb.hyp.${i}` }));

  const wrap = root.append("div").attr("class", "vb wrap");
  divisions.forEach(d => {
    if (hypothetical) {
      const sizes = splitGroups(d.names.length, 4);
      packRings(wrap, d.title, slices(d.names, sizes), d.subKey, sizes.length);
    } else {
      const panel = wrap.append("div").attr("class", "vb panel wide");
      panel.append("div").attr("class", "cap").text(d.title);
      panel.append("div").attr("class", "cap2").text(`${d.names.length} teams · ${d.names.length % 2 ? "one waits" : "nobody waits"}`);
      mount(panel.append("svg"), { id: d.key, key: d.key, names: d.names });
    }
  });
  sync();
  return node;
}
```

---

## Cell 8 — who plays when

A running list of each team's two games, in order — read straight from the rings above, so it
works for the real pools and the hypothetical split alike. "A then B" once a first game is set,
"A or B" while a team is still waiting.

```js
playOrder = Inputs.table(
  pools.flatMap(p => {
    const L = p.names.length;
    return p.names.map((team, i) => {
      const prev = p.names[(i - 1 + L) % L], next = p.names[(i + 1) % L];
      const pair = p.pairs.find(([a, b]) => a === team || b === team);
      const first = pair ? (pair[0] === team ? pair[1] : pair[0]) : null;
      return { Team: team,
               Plays: first ? `${first} THEN ${first === prev ? next : prev}` : `${prev} OR ${next}` };
    });
  })
)
```

---

### Good to know
- Your picks are saved automatically, so they're still here when you come back.
- Green means a team has its first game set; orange means it's still waiting for one.

---

## In short

Because each team can only play one game at a time, every round you can pair up teams two-by-two —
and when a pool has an **even** number of teams, everyone can be paired at once, so nobody waits.
With an **odd** number (like the 9-team pools here), that's simply not possible: there's always one
team left over with no free partner, so at least one team has to wait each round. That's a fact of
the math, not a scheduling mistake — the goal isn't to remove the wait but to make it short and fair:

- **Rotate the bye** — make sure a *different* team sits out each round, so no one waits over and over while others never do.
- **Put the wait to use** — have the waiting team referee or keep score for a game in progress, turning idle time into useful time.
- **Even out the pools when you can** — merging two pools, moving a team, or adding a fill-in to reach an even count makes a no-wait round possible.
- **Play in parallel** — with enough courts, all of a round's games run at once, so the only wait left is that single unavoidable bye.
- **Use the fewest rounds** — an even pool finishes in two no-idle rounds, an odd pool in three; scheduling to that minimum keeps everyone's total downtime as low as it can be.
