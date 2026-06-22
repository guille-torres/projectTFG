"""
Inputs / outputs
----------------
Inputs:
    output/surface.gltf
    output/flowfield_<Q>_<variable>.gltf
Outputs:
    output/surface.glb
    output/blender/flowfield_<Q>_<variable>.glb     (30 files)

Run:
    /Applications/Blender.app/Contents/MacOS/Blender --background \\
        --python scripts/blender_embed.py
    # or, to process a single Q:
    /Applications/Blender.app/Contents/MacOS/Blender --background \\
        --python scripts/blender_embed.py -- --q 0.01
"""

import argparse
import os
import sys

import bpy

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output")
BLENDER_OUT = os.path.join(OUTPUT_DIR, "blender")
os.makedirs(BLENDER_OUT, exist_ok=True)

Q_VALUES = [0.001, 0.01, 0.1, 1.0, 5.0]

VARIABLES = [
    "Pressure",
    "Velocity",
    "Density",
    "TurbulentEnergyKinetic",
    "ViscosityEddy",
    "TurbulentDissipationRate",
]

MERGE_BY_DISTANCE_THRESHOLD = 1e-4
DECIMATE_COLLAPSE_RATIO     = 0.15
DRACO_LEVEL                 = 2
DRACO_POSITION_BITS         = 11
DRACO_NORMAL_BITS           = 8
DRACO_TEXCOORD_BITS         = 10


def q_label(q):
    if q == int(q):
        return str(int(q))
    return str(q).replace(".", "_")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def optimize_mesh(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=MERGE_BY_DISTANCE_THRESHOLD)
    bpy.ops.object.mode_set(mode='OBJECT')

    dec = obj.modifiers.new(name="Decimate", type='DECIMATE')
    dec.decimate_type = 'COLLAPSE'
    dec.ratio = DECIMATE_COLLAPSE_RATIO
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="Decimate")


def export_glb(glb_out, draco=True):
    kwargs = dict(
        filepath=glb_out,
        export_format="GLB",
        export_image_format="AUTO",
        use_selection=False,
    )
    if draco:
        kwargs.update(
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=DRACO_LEVEL,
            export_draco_position_quantization=DRACO_POSITION_BITS,
            export_draco_normal_quantization=DRACO_NORMAL_BITS,
            export_draco_texcoord_quantization=DRACO_TEXCOORD_BITS,
        )
    bpy.ops.export_scene.gltf(**kwargs)


def build_one_pair(q, variable):
    gltf_in = os.path.join(OUTPUT_DIR, f"flowfield_{q_label(q)}_{variable}.gltf")
    glb_out = os.path.join(BLENDER_OUT, f"flowfield_{q_label(q)}_{variable}.glb")
    if not os.path.isfile(gltf_in):
        print(f"[skip] missing {os.path.basename(gltf_in)}")
        return None

    print("-" * 60)
    print(f"Q={q}  {variable}  ->  {os.path.basename(glb_out)}")
    print("-" * 60)

    reset_scene()
    bpy.ops.import_scene.gltf(filepath=gltf_in)
    mesh_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not mesh_objs:
        raise RuntimeError(f"No mesh imported from {gltf_in}")
    obj = mesh_objs[0]

    optimize_mesh(obj)
    print(f"  [dec] {len(obj.data.vertices)} verts, {len(obj.data.polygons)} tris")

    export_glb(glb_out)
    size_mb = os.path.getsize(glb_out) / (1024 * 1024)
    print(f"[ok ] {os.path.basename(glb_out)}  ({size_mb:.2f} MB)")
    return size_mb


def repack_surface():
    surface_gltf = os.path.join(OUTPUT_DIR, "surface.gltf")
    surface_glb = os.path.join(OUTPUT_DIR, "surface.glb")
    if not os.path.isfile(surface_gltf):
        print(f"[skip] surface: missing {surface_gltf}")
        return
    reset_scene()
    bpy.ops.import_scene.gltf(filepath=surface_gltf)
    # Conservative export: no Decimate, default Draco — surface geometry
    # must stay visually crisp (airfoil profile).
    bpy.ops.export_scene.gltf(
        filepath=surface_glb,
        export_format="GLB",
        export_image_format="AUTO",
        use_selection=False,
        export_draco_mesh_compression_enable=True,
    )
    print(f"[ok ] surface.glb")


def parse_args():
    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1:]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--q", type=float, default=None,
                   help="Only build this Q level (e.g. 0.01). Default = all 5.")
    p.add_argument("--variable", type=str, default=None,
                   help="Only build this variable. Default = all 6.")
    p.add_argument("--skip-surface", action="store_true",
                   help="Skip surface.glb regeneration.")
    return p.parse_args(argv)


def main():
    args = parse_args()
    qs = [args.q] if args.q is not None else list(Q_VALUES)
    vars_ = [args.variable] if args.variable is not None else list(VARIABLES)

    print("=" * 70)
    print("Blender pipeline — LEGACY (P10)")
    print(f"  Merge by Distance threshold : {MERGE_BY_DISTANCE_THRESHOLD}")
    print(f"  Decimate Collapse ratio     : {DECIMATE_COLLAPSE_RATIO}")
    print(f"  Draco level / bits          : L{DRACO_LEVEL} / "
          f"pos {DRACO_POSITION_BITS} / nrm {DRACO_NORMAL_BITS} / "
          f"tex {DRACO_TEXCOORD_BITS}")
    print(f"  Q levels                    : {qs}")
    print(f"  Variables                   : {vars_}")
    print("=" * 70)

    if not args.skip_surface:
        repack_surface()

    total = 0.0
    n_ok = 0
    for q in qs:
        for v in vars_:
            try:
                mb = build_one_pair(q, v)
                if mb is not None:
                    total += mb
                    n_ok += 1
            except Exception as exc:
                print(f"[ERR] Q={q} {v}: {exc}")
                import traceback
                traceback.print_exc()

    print("=" * 70)
    print(f"Done. {n_ok} flowfield GLBs, total {total:.2f} MB.")
    print("=" * 70)


if __name__ == "__main__":
    main()
