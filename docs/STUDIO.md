# Studio

The studio turns any prop into store pictures, ads and short clips without leaving the game. Open it with
`/propstudio [model]`, from the hub's Studio button, or from a model's Shoot button.

## Layout

- **Left, the scene:** Stage and light, Camera, then Props, People, Lights, Effects, Brand walls, and the overlays
  that sit on top of the image. `+` on a group adds to it; the eye hides an item without deleting it.
- **Right, the inspector:** settings for whatever is selected. Click an item in the list or in the scene.
- **Centre, the frame:** the crop of the final picture. Pick a ratio at the top (Screen, 1:1, 4:5, 16:9, 9:16, 3:2,
  21:9). Outside the frame is dimmed. Guides: thirds, centre (with a safe area), golden.
- **Bottom:** the shot strip, the shutter, output settings, batches and Motion (camera keyframes).

The panels are never part of a picture: the studio reads the game's own frame, not the screen.

## Moving around

| Input | Does |
|---|---|
| Right mouse + WASD, Q/E | Fly. Shift faster, Ctrl slower, wheel changes speed while flying |
| Middle mouse drag (or Alt + left) | Orbit the selection |
| Shift + middle mouse | Pan |
| Wheel | Zoom toward the orbit centre |
| F | Frame the selection |
| W / E, Q | Gizmo move / rotate, world or local axes |
| H | Hide every panel and see the clean frame |
| Space or Enter | Capture |
| B | Save the current view as an angle |
| K | Add a camera keyframe |
| Ctrl+S | Save the scene |

## Stage and light

- **Closed set:** built where you stand, with a backdrop on every side (floor and ceiling too), so nothing of the map
  shows and your lights make the picture. Default for product shots.
- **Open world:** the real world is the background. Add a backdrop to block it out locally.
- **Backdrop:** Sweep (floor and top colour, a soft gradient), Chroma (a key colour for keying), or None. It is a box
  around the stage, so every camera angle sees it. Turn off the backdrop floor to keep the real ground (and its shadows).
- **Time and weather:** set only for you. Night (22 to 4) leaves only your lights on the subject.
- **Look:** a timecycle grade with a strength.
- **Detail:** GTA lowers the detail of a prop by its distance from **your character**, not the camera. The studio parks
  your character, invisible, next to the subject, so the prop stays at full detail however far the camera goes. Turn it off
  to keep your character where it was. `Detail boost` raises the whole map's level of detail; it is off by default and capped
  at 1.25× because higher values make the game stream more map than its pools hold and crash the client.

## Lights

Key, fill, rim, top and practical presets. Each has a colour temperature (1800 to 10000 K) or a gel colour,
brightness, reach, beam angle and softness (spots), shadows, and "aim at the subject". Use ⋯ → Place at camera to put
a light exactly where you are looking from. The game allows only a few shadowed lights at once; keep shadows on the key.

## People and effects

People: any ped model or a copy of your own character, with an animation or scenario, posed with the gizmo.
Effects: looped particle effects (smoke, steam, sparks, fire, water) with scale and tint.

## Brand walls

A DUI screen drawn as a wall in the scene: title, a line under it, the OsmFX mark, accent and background colours, or an
image link. Use it for branded backgrounds that catch the lens like real set pieces.

## Overlays

Composited onto the picture, previewed exactly as exported:
- **Text:** headline, caption, price tag. Size is a share of the picture height, so it looks the same at any output size.
- **Logo:** the OsmFX mark, or any image link (the host must allow cross-origin loading).
- **Interaction callout:** a target-style prompt (key chip, label, second line) pointing at a spot on the prop. It
  follows that spot in 3D as the camera moves. Use it to show what the prop can do (Inflate tyre, Check pressure).

Drag text and logos in the frame to place them.

## Output

| Setting | Notes |
|---|---|
| Background: As seen | The frame as it is |
| Background: Cut out | Two passes, one on a black backdrop and one on a white one. What changed between them is the background; the result is an exact transparent PNG with soft edges and glass. Keep the scene still (no smoke, no animated peds) |
| Background: Chroma key | One pass on the chroma backdrop, keyed in YCbCr with spill removal. Works with motion and smoke |
| Format | PNG, WebP, JPG (JPG has no transparency) |
| Width | Native crop size, or scaled to 1080 / 1600 / 2048 / 3000 px |
| Smoothing | Averages 4 or 8 frames, removes the game's shimmer on thin edges |
| Grade | Exposure, contrast, saturation, vignette (vignette only on opaque pictures) |

Quality tip: the native crop is limited by your game resolution. Run the game at 1440p or 4K for the best pictures and
turn off motion blur. A 1:1 crop at 1440p is 1440 × 1440.

## Batches

- **Turntable:** spins the subject in 8, 12 or 24 steps and takes a picture at each, for 360 views.
- **Every saved angle:** visits each saved camera angle and shoots it.

## Motion

Frame a view and press K; repeat. The keys sit on a timeline you can retime by dragging (right click deletes). Play
glides the camera through them on a smooth spline. **Record** (experimental) captures the frame as WebM while the path
plays, if the game's browser supports it; otherwise play the path and record with OBS.

## Where pictures go

Every shot is written to `osm-propkit/shots/<date>/` on the server and listed in the database with a thumbnail. From
the strip, open a shot to copy it to the clipboard (paste into Discord), make it the model's library picture, or delete
it. Set `Config.Studio.upload` to also send each shot to a Discord webhook, Fivemanage or your own endpoint.

## Interaction prompts in shots

osm-target draws its prompts in the world, so they appear in captures like any other part of the scene. For other
target scripts, or to stage a prompt exactly, use an interaction callout overlay.
