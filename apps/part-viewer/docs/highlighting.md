# Highlighting — the colour spec

Every colour on the 3D part: what it means, what overrides what, and which
colours belong to a mode, to a list, or to the pointer. Written from the running
code, with the file each value lives in.

Sources of truth:

- `app/shared/paint.ts` — the standing wash, and which mode is on
- `app/shared/bands.ts` — band colours, and which band wins a shared face
- `app/shared/selection-colors.ts` — picked, highlight, hover
- `app/shared/highlighting.ts` — which list is allowed to light the part
- `packages/viewer/src/render/theme.ts` — the part itself, and the direction
  cycle

---

## 1. The constraint everything else follows from

**A face can only be one colour.**

The part is one mesh, and each face — the Engine calls it a _region_ — carries a
single texel in a state texture. That is not a rendering shortcut we could spend
our way out of; it is what the mesh is.

It matters because **a face is owned by five to eight features at once**: the
same wall is a `wall` from −Y, a `face` from +Z, and part of a `profile` from
three more directions. All of those readings are real and they can disagree
about how hard the face is. So the part cannot show "this surface is eight
things" — it shows one answer, and the panel beside it carries the rest.

The corollary: the part is not where detail is read off. It is where something
is _found_, and clicked. A colour earns its place by making a location findable,
not by carrying what a list could carry better.

---

## 2. The layer stack

Painted **weakest first; later layers overwrite earlier ones.** Nothing blends —
the last layer to touch a face wins it outright. _Weight_ is how strongly a
colour covers the bare surface, 0 to 1: a low weight is a wash the shape still
reads through, 1 is flat colour.

| #   | Layer                  | Weight | What it says                                 | Where from                          |
| --- | ---------------------- | ------ | -------------------------------------------- | ----------------------------------- |
| 0   | Bare part              | —      | Nothing has an opinion about this face       | `theme.ts`                          |
| 1   | Paint mode             | 0.7    | The standing wash: directions, or difficulty | `paint.ts` — `paintWash`            |
| 2   | A list's highlight     | 0.7    | An open type, or a row under the pointer     | `highlighting.ts` — `listHighlight` |
| 3   | The reading being read | 1.0    | What the panel is describing                 | `selection-colors.ts` — `highlight` |
| 4   | The faces held         | 1.0    | The face you actually clicked                | `selection-colors.ts` — `picked`    |
| 5   | Hover                  | 0.85   | What the pointer is on                       | `selection-colors.ts` — `hover`     |

Layer 1 is about **the part**. Layer 2 is about **a question a list is asking**.
Layers 3–5 are about **the pointer**, and they are in that order on purpose: a
question asked with the mouse beats a decision already on screen, because the
decision is still there when the pointer moves away.

**Layers 3 and 4 are one gesture at two depths.** The face clicked is the
deepest blue because it is the only one that was chosen; the rest of the feature
that click was read as is a step lighter, because it was _inferred_ and inferred
faces must not out-shout the one they were inferred from.

### Not built

Three layers exist in the picker and have no counterpart here, listed so their
absence is a decision rather than a gap nobody noticed:

- **Sharp corners** — red over everything, on mapped work only. The picker's own
  `docs/sharp-corners.md` says why it needs rebuilding before it is copied.
- **Proposals**, and the green "this one" inside them — needs the offer, which
  needs a plan.
- **Faces painted by hand**, and the outline around them — PR 7 of the
  directions plan.

---

## 3. Which list gets to light the part

Three things can want the part painted at once — an open type in the summary, a
row under the pointer, and the feature that was clicked — and they are not
equal. `listHighlight` settles it:

1. **A row under the pointer replaces an open type.** Hovering one feature is a
   narrower question than the type it belongs to, and the narrower question is
   the one being asked.
2. **The pointer over the part removes the type's paint** — sixty lit faces
   standing between somebody and the face they are reaching for is a highlight
   that has outlived its usefulness.
3. **A click of any kind puts the type's question down**, but leaves the list
   open: the list is how somebody got here and how they get back. Opening a type
   afterwards picks a new question up.

That third rule is the caller's to enforce (`typeIsAsking`), not
`listHighlight`'s. Deciding it inside on "is anything selected" would make a
type opened _after_ a click paint nothing at all.

---

## 4. The palette

### The part

White, with black edges at 50%. Region-aware normals mean a bore shades smoothly
and an edge stays hard — the Engine's mesh ships positions only, so normals are
invented, and averaging within a region but never across one is what makes that
work.

### Directions — nine colours, cycling

| #   | Colour            |     | #   | Colour          |     | #   | Colour            |
| --- | ----------------- | --- | --- | --------------- | --- | --- | ----------------- |
| 0   | blue `#3b82f6`    |     | 3   | cyan `#06b6d4`  |     | 6   | slate `#64748b`   |
| 1   | teal `#14b8a6`    |     | 4   | olive `#65a30d` |     | 7   | emerald `#10b981` |
| 2   | fuchsia `#d946ef` |     | 5   | pink `#ec4899`  |     | 8   | indigo `#6366f1`  |

A part with ten candidate directions wraps. The same colour identifies that
direction **in three places** — on the part, on its arrow, and on its row —
which is the whole point of the palette: it is an identity, not a ranking, which
is why the colours are unordered and deliberately not a scale.

A feature whose direction is not among the candidates is left **bare** rather
than given a colour of its own. Nothing observed produces one, and inventing a
tenth colour would say the part has a way up the arrows do not show.

### Difficulty — five bands, not a gradient

| Band       | Colour             |
| ---------- | ------------------ |
| easy       | `#4ea172` green    |
| alright    | `#62b6a8` sea foam |
| meh        | `#e0b53d` yellow   |
| rats       | `#e07a48` orange   |
| no go      | `#d6455d` red      |
| _unjudged_ | `#9ca3af` grey     |

Five bands are five decisions a shop made; a shade between two of them would be
a number the app invented.

**Which owner wins a shared face:** painted **easiest last**, so the gentler
reading is the one on screen. A face nobody has placed is shown at its best —
the best a shop could do if it held the part that way — because a face that some
awkward five-axis approach also happens to reach is not a problem face. Unjudged
paints first and loses to everything: "nobody looked" must not cover a colour
that means something, and leaving it bare would read as "fine".

(The picker adds one more rule here that this app cannot yet: **a mapped reading
beats the easiest one**, because once somebody has said "this is cut from −Y",
showing the easier unchosen answer is the app disagreeing with the plan on
screen. That arrives with the plan.)

### The selection — one blue at three depths

| Meaning                                | Colour    |
| -------------------------------------- | --------- |
| The face clicked                       | `#3e6bcc` |
| The rest of the feature it was read as | `#6d97dd` |
| Hover                                  | `#93b6ea` |

Saturated enough to still read as blue over a light grey part, but eased off the
fully saturated version, which sat on the part as a slab of colour rather than
as a face wearing one. There is a floor: brightened or drained much further it
becomes a white patch and the thing being read stops being a colour at all.

**One rig, not two — and that is a decision with an expiry date.** The picker
carries a warm selection for Directions and a cool one for Difficulty, because
one colour cannot stand out over two palettes: the direction cycle is cool, so a
selection there has to be warm; the difficulty bands _are_ the warm ramp, so a
selection there has to be cool. This app paints by difficulty already, so the
blue is right for that mode and is **working against the direction cycle**,
which is cool too. Worth fixing when Directions mode carries a plan rather than
each feature's own axis; the picker's `selectionColors(mode)` is the shape of
the fix.

---

## 5. What we know is unresolved

1. **The selection blue sits in the direction cycle.** §4, above. Directions
   mode is the one place the current palette is knowingly wrong.
2. **One face, one colour** (§1) means Directions and Difficulty can never be
   read together. Today that is two button presses.
3. **Bands are not colour-blind safe.** Green-through-red is the shop's own
   language, and there is no non-colour channel for band on the part — no
   pattern, no label.
4. **Nothing on the part names anything.** No labels, no legend in the viewport;
   the legend is the panel beside it, which assumes the panel is open.
5. **Fixed hexes in both themes.** Every colour above is the same in light and
   dark; only the background changes.
