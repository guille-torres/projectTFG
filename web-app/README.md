# CFD WebXR Visualizer

BabylonJS web app for visualizing CFD isosurfaces (Q-criterion) in WebXR.

---

## Project structure

```
web-app/
  index.html            — HTML entry point (Vite root)
  vite.config.ts        — Vite + build configuration
  tsconfig.json         — Single TypeScript config (ES2020, bundler resolution)
  src/client/
    app.ts              — Main BabylonJS scene, GLB loading, WebXR, UI binding
    legend.ts           — Colorbar legend (@babylonjs/gui fullscreen 2D layer)
  public/
    style.css           — Overlay UI styles
    output/
      blender          — 30 decimated GLBs
      surface.glb      — surface mesh
```

## GLB assets (output/)

The 30 flowfield GLBs + surface.glb live at `output/`.
**GLB path resolution in app.ts:**
- Primary: `./output/blender/flowfield_<Q>_<variable>.glb`
- Fallback: `./output/flowfield_<Q>_<variable>.glb`
- Surface: `./output/surface.glb`
- Missing GLBs trigger a coloured mock mesh (development fallback).

## Colorbar legend

`src/client/legend.ts` renders a `@babylonjs/gui` fullscreen 2D layer with:
- A "Cool to Warm" gradient (ParaView default LUT: blue → white → red).
- Variable name + SI units.
- Min/max values hardcoded from the pipeline variable ranges.

The legend updates automatically when the user clicks a variable button.

## WebXR (VR + AR)

`initXR()` in app.ts:
1. Checks `navigator.xr.isSessionSupported("immersive-vr")`.
2. Falls back to `immersive-ar` if VR is not available.
3. Falls back silently if neither is supported.

HTTPS is required for WebXR.