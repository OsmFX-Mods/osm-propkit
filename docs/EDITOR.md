# Placing props

Pick a model in Hub → Library and press **Place** (or `+` on its card), or open a placement and press **Edit in world**.
The camera leaves your character and the prop gets a gizmo.

## Camera

| Input | Does |
|---|---|
| Right mouse + WASD, Q/E | Fly. Shift faster, Ctrl slower, wheel changes fly speed |
| Middle mouse drag (or Alt + left) | Orbit around the prop |
| Shift + middle mouse | Pan |
| Wheel | Zoom |
| F | Frame the prop |
| H | Hide the panels |

The world streams around the camera, so you can fly to a spot far from your character and place there.

## Gizmo

| Handle | Does |
|---|---|
| Arrows | Move along one axis |
| Squares | Move in a plane |
| Centre disc | Drag the prop over surfaces under the cursor (rests its underside on them) |
| Rings (press E) | Turn about one axis |

- **W / E** move or rotate, **Q** world or local axes.
- **X** turns snapping on (step chosen next to it: 0.01 to 1 m, 1 to 90°). Hold **Ctrl** to invert snapping for one drag.
- Hold **Shift** for fine movement (one tenth).
- **Ctrl+Z / Ctrl+Y** undo and redo, 100 steps.
- Type exact values in the inspector, or drag sideways on an axis label (X, Y, Z, P, R, Y) to scrub it.

## Tools

- **Surface (S):** click anywhere to rest the prop there.
- **Ground (G):** drops the prop so the lowest corner of its rotated bounding box touches what is below.
  With "Tilt to the surface" on, it also matches the slope.
- **Anchor (A):** click a map object (a shelf, a counter). The prop is then stored relative to that object, so it lands
  on it on every client. If the object is not found, the stored coordinates are used.

The inspector shows height above ground (warning if it is inside the ground), distance from your character, and
whether the prop is inside an interior. Interiors are saved by their name and room, so MLO props render correctly
after restarts.

## Saving

**Enter** saves. For a new prop, **Shift+Enter** (Save + next) saves and keeps placing copies from the same spot.
**Esc** leaves (asks if anything changed).

Coordinates are saved to 4 decimals and rotations to 3, as `DOUBLE` columns. Props spawn at exactly those values and
frozen; nothing is snapped to the ground at spawn time.

## Interaction points

Hub → Interactions → an interaction → "A point on it" → **Pick on the prop** opens the prop in the editor. Click the
spot (a valve, a button, a lid). Other points show as numbered pins. **Done** returns to the interaction with the
offset filled in.
