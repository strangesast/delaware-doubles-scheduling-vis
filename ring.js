/* Shared ring graph.
   buildRing(svgSel, opts) where opts:
     key      localStorage key (persists "<n>:<edgeMask>")
     names    optional array of real team labels (cycle order). Fixes the team count
              and draws names outside the ring. Omit for the T1..Tn demo.
     slider   set false to hide the team-count slider (also auto-hidden when names given)
   Teams sit on a ring; each plays its 2 neighbours. Click a link to set/unset who plays
   first, a team plays at most one other. Links grow from each circle to the centre
   (orange), turning green the instant they meet; reverse on destroy. */

const MIN = 4, MAX = 16, DEFAULT = 8;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lowBits = b => (1 << b) - 1;                       // bits 0..b-1
const matchingMask = n => { let m=0; for (let k=0; k+1<n; k+=2) m |= 1<<k; return m; };

// Break `total` into rings each AT LEAST `target` big: peel off target-sized rings and fold any
// leftover smaller than the target into the last ring (e.g. total 10, target 4 → [4, 6]).
const splitGroups = (total, target) => {
  const g = Math.max(1, Math.floor(total / target));
  return Array.from({ length: g }, (_, i) => i < g - 1 ? target : total - target * (g - 1));
};

// Keep the same number of `divisions` but resize them, preferring multiples of 4 so most groups
// pair off cleanly; the leftover group carries the remainder (and the lone odd group when the
// total is odd). Every group is AT LEAST 4. e.g. 27 into 3 → [8, 8, 11].
const evenGroups = (total, divisions) => {
  const D = Math.max(1, Math.min(divisions, Math.floor(total / 4)));   // every group >= 4
  let base = Math.max(4, 4 * Math.round(total / D / 4));               // a multiple of 4 near the average
  while (D > 1 && total - base * (D - 1) < 4) base -= 4;               // keep the leftover group >= 4
  return Array.from({ length: D }, (_, i) => i < D - 1 ? base : total - base * (D - 1));
};

function buildRing(svgSel, opts = {}) {
  const names     = opts.names || null;                  // fixed roster → real names + fixed count
  const fixed     = !!names;
  const key       = opts.key;
  // opts.n: drive the team count from outside (e.g. a separate slider cell). Disables the built-in slider.
  const extN      = (!fixed && opts.n != null) ? clamp(opts.n, MIN, MAX) : null;
  const useSlider  = opts.slider !== false && !fixed && extN == null;

  const R     = opts.r ?? 150;                                  // ring radius (override to pack compactly)
  const RNODE = opts.rNode ?? Math.round(R * (fixed ? 16 : 22) / 150);
  const DUR   = 380;

  // persisted state "<n>:<edgeMask>" — edge bit k means team k plays team (k+1)%n
  const saved  = (localStorage.getItem(key) || '').split(':');
  const savedN = fixed ? names.length : clamp(parseInt(saved[0],10) || DEFAULT, MIN, MAX);
  let n    = extN != null ? extN : savedN;
  let mask = (saved[1] !== undefined && saved[1] !== '') ? (+saved[1] & lowBits(savedN)) : matchingMask(savedN);
  if (!fixed && n !== savedN) mask &= lowBits(Math.min(savedN, n) - 1);   // migrate when the count changed
  mask &= lowBits(n);
  const save = () => localStorage.setItem(key, `${n}:${mask}`);
  save();

  const labelOf = k => fixed ? names[k] : 'T' + (k+1);
  // expose the current first-game pairs to an optional listener (e.g. an external table/view)
  const currentPairs = () => {
    const out = [];
    for (let k=0; k<n; k++) if ((mask>>k)&1) out.push([labelOf(k), labelOf((k+1)%n)]);
    return out;
  };
  const emit = () => { if (opts.onChange) opts.onChange(currentPairs()); };

  // optional slider, inserted above the svg
  let sliderLabel;
  if (useSlider) {
    const ctrl = d3.select(svgSel.node().parentNode).insert('div','svg').attr('class','ctrl');
    sliderLabel = ctrl.append('label');
    ctrl.append('input').attr('type','range')
      .attr('min',MIN).attr('max',MAX).attr('step',1).attr('value',n)
      .on('input', function() {
        const newN = +this.value;
        mask &= lowBits(Math.min(n, newN) - 1);   // keep shared links; drop wrap & removed teams
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
    const shown = new Array(n).fill(false);    // last target state per edge (drives diffing)
    const setEdge = e => { mask &= ~(1<<((e-1+n)%n)); mask &= ~(1<<((e+1)%n)); mask |= 1<<e; };

    // faint guide lines — always visible so the click structure stays clear
    const ringLines = root.append('g').selectAll('line').data(EDGES).join('line')
      .attr('class','ring').attr('pointer-events','none')
      .attr('x1',ex1).attr('y1',ey1).attr('x2',ex2).attr('y2',ey2);

    // pairing layer: one persistent <g> per edge, kept in the DOM so transitions are interruptible
    const pathLayer = root.append('g');
    const pairs = pathLayer.selectAll('g.pair').data(EDGES).join(enter => {
      const g = enter.append('g').attr('class','pair').style('display','none');
      g.append('line').attr('class','half h1');
      g.append('line').attr('class','half h2');
      return g;
    });
    pairs.each(function(k){                    // both halves start collapsed at their circle
      const a=[A(k).x,A(k).y], b=[B(k).x,B(k).y], g=d3.select(this);
      g.select('.h1').attr('x1',a[0]).attr('y1',a[1]).attr('x2',a[0]).attr('y2',a[1]);
      g.select('.h2').attr('x1',b[0]).attr('y1',b[1]).attr('x2',b[0]).attr('y2',b[1]);
    });

    // wide invisible hit targets — UNCHANGED click zone (full line between the two teams)
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

    // circles (+ labels: inside for the demo, outside for real names)
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

    // Animate only edges whose target state changed. Grow on create, shrink on destroy;
    // orange while moving, each half greens ITS circle the exact instant it reaches the centre.
    // Same path for a direct click and for a link displaced by another click. Interruptible:
    // a re-click flips shown[k] and the new transition .interrupt()s the in-flight one.
    function update(animate) {
      pairs.each(function(k){
        const want = !!on(k);
        if (want === shown[k]) return;         // unchanged → leave any running transition alone
        shown[k] = want;
        const g = d3.select(this), h1 = g.select('.h1'), h2 = g.select('.h2');
        const a=[A(k).x,A(k).y], b=[B(k).x,B(k).y], m=mid(k);
        h1.classed('live',false).classed('pending',true);
        h2.classed('live',false).classed('pending',true);

        if (want) {                            // CREATE — grow toward centre
          g.style('display',null);
          const arrive = (half, team) => { half.classed('pending',false).classed('live',true); colorTeam(team,true); };
          if (animate) {
            // ease-OUT so motion starts the instant you click (max velocity at t=0). Flip each
            // half/circle to green the moment its round cap reaches the centre (just before t=1),
            // so the colour change stays in sync with the visual connection.
            const grow = (half, fromPt, team) => {
              const len = Math.hypot(m[0]-fromPt[0], m[1]-fromPt[1]);
              const thr = len > 9 ? 1 - 4.5/len : 1;      // caps (stroke 9 → r≈4.5) meet at the centre
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
        } else {                               // DESTROY — shrink back to the circles (orange at once)
          colorTeam(k,false); colorTeam(otherOf(k),false);
          const hide = () => g.style('display','none');
          if (animate) {
            // ease-OUT: the time-reverse of create, so destroy looks like create played backwards
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
