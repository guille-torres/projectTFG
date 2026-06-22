# scripts/

Pipeline scripts. Two stages:

1. **`optimise_pvtu.py`** — ParaView (`pvbatch`) pipeline. Reads
   `data/flowfield.pvtu` and `data/surface.pvtu`, applies
   *Gradient → CellDataToPointData → Contour*, and exports one glTF
   per (Q-criterion isovalue, variable) pair, plus one colormap PNG per
   variable (Pressure, Velocity Magnitude, Density, TurbulentEnergyKinetic,
   ViscosityEddy, TurbulentDissipationRate).

2. **`blender_embed.py`** — Blender background script. For each of the 30
   flowfield glTFs emitted by ParaView, it applies:

   - **Merge by Distance** (threshold = **1×10⁻⁴** world-space units).
     Removes near-duplicate vertices left by ParaView's Contour filter
     (Uniform Binning merge step). Reduces vertex count ~5–15 % with
     negligible visual change.
   - **Decimate modifier, mode = Collapse, ratio = 0.15** (keeps 15 % of
     faces). Chosen after visual inspection of the Q = 0.1 isosurface (a
     representative middle case): the vortex wake structure is clearly
     preserved, no topological tearing near vortex cores, and the resulting
     GLB file (after Draco) is comfortably below 10 MB.
     Rationale for 0.15 vs alternatives:
       - ratio > 0.30 → GLB > 15 MB, repo total > 1 GB → GitHub Pages limit.
       - ratio < 0.05 → visible topological tearing near vortex cores.
       - 0.15 → ~2.6–3.5 MB per GLB with Draco L2; total ~94 MB.
   - **Draco mesh compression** (`export_draco_mesh_compression_enable=True`,
     compression level **2**, quantization: position **11** bits, normal **8**,
     texcoord **10**, color 10, generic 12). L2 was adopted on 2026-06-07
     (V2.3, Resume.md) to reduce client-side decode cost; the output is
     also ~30 % smaller than the previous L6 baseline.

   For the surface mesh (`surface.gltf → surface.glb`) no geometric
   decimation is applied — only Draco compression.

## Run

```bash
# from project root
/Applications/ParaView-6.1.0.app/Contents/bin/pvbatch scripts/optimise_pvtu.py
/Applications/Blender.app/Contents/MacOS/Blender --background \
    --python scripts/blender_embed.py
```

## Parameters

### Q-criterion isovalues
`[0.001, 0.01, 0.1, 1.0, 5.0]`

### Variables and LUT ranges

| Variable | Array name in ParaView | Min | Max |
| Pressure | `Pressure` | 26.0 | 32.0 |
| Velocity (Magnitude) | `Velocity` | 0.0 | 3.0 |
| Density | `Density` | 0.85 | 1.0 |
| TurbulentEnergyKinetic | `TurbulentEnergyKinetic` | 1×10⁻¹² | 1.1×10⁻¹² |
| ViscosityEddy | `ViscosityEddy` | 3×10⁻¹³ | 3.5×10⁻¹³ |
| TurbulentDissipationRate | `TurbulentDissipationRate` | 2.85 | 3.2 |

### Decimation parameters (blender_embed.py)

| Parameter | Value | Notes |
| Merge by Distance threshold | 1×10⁻⁴ | World-space units matching ParaView output |
| Decimate Collapse ratio | 0.15 | Keeps 15 % of faces; see rationale above |
| Draco compression level | 2 | Lower encode time, ~30 % smaller output than L6 (2026-06-07) |
| Draco position quantization | 11 bits | |
| Draco normal quantization | 8 bits | |
| Draco texcoord quantization | 10 bits | |

## Output

```
output/
  surface.glb                              (~2 MB; Draco only)
  surface.gltf + buffer*.bin               (ParaView raw; Blender input)
  flowfield_<Q>_<variable>.gltf            (ParaView raw; Blender input)
  buffer*.bin                              (sidecar to above)
  blender/
    flowfield_<Q>_<variable>.glb           (final; decimated + Draco)
  flowfield_<Q>_<variable>/colormap.png    (legend PNG; documentation only)
  decimation_report.md                     (before/after size table; Thesis)
```