"""
ParaView pvbatch pipeline.

Reads:
    data/flowfield.pvtu  — volumetric CFD field
    data/surface.pvtu    — airfoil/wing surface mesh

Filter pipeline applied to flowfield:
    Gradient (Q-Criterion + gradient of Velocity)
      -> CellDataToPointData
      -> Contour (one isosurface per Q in [0.001, 0.01, 0.1, 1, 5])

Outputs:
    output/surface.gltf
    output/flowfield_<Q>_<variable>.gltf   (5 Q x 6 vars = 30 GLTFs, each
                                            with vertex colors baked from
                                            ParaView's ColorBy + custom range)

Variables exported as textures (with custom data ranges):
    Pressure                 [26, 32]
    Velocity (Magnitude)     [0, 3]
    Density                  [0.85, 1]
    TurbulentEnergyKinetic   [1e-12, 1.1e-12]
    ViscosityEddy            [3e-13, 3.5e-13]
    TurbulentDissipationRate [2.85, 3.2]

Run:
    /Applications/ParaView-6.1.0.app/Contents/bin/pvbatch scripts/optimise_pvtu.py
"""

import os
import sys

from paraview.simple import (
    XMLPartitionedUnstructuredGridReader,
    Gradient,
    CellDatatoPointData,
    Contour,
    ExportView,
    GetActiveViewOrCreate,
    Show,
    Hide,
    Render,
    GetColorTransferFunction,
    ColorBy,
    ResetCamera,
    Delete,
)

# ----------------------------------------------------------------------
# Paths
# ----------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "output")

FLOWFIELD_PVTU = os.path.join(DATA_DIR, "flowfield.pvtu")
SURFACE_PVTU = os.path.join(DATA_DIR, "surface.pvtu")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------
Q_VALUES = [0.001, 0.01, 0.1, 1.0, 5.0]
VARIABLES = [
    # (paraview_array_name, frontend_label, range, component)
    ("Pressure",                 "Pressure",                 (26.0, 32.0),         None),
    ("Velocity",                 "Velocity",                 (0.0, 3.0),           "Magnitude"),
    ("Density",                  "Density",                  (0.85, 1.0),          None),
    ("TurbulentEnergyKinetic",   "TurbulentEnergyKinetic",   (1e-12, 1.1e-12),     None),
    ("ViscosityEddy",            "ViscosityEddy",            (3e-13, 3.5e-13),     None),
    ("TurbulentDissipationRate", "TurbulentDissipationRate", (2.85, 3.2),          None),
]

def q_label(q):
    """Filename-safe label for a Q value: 0.001 -> '0_001', 1.0 -> '1', 5.0 -> '5'."""
    if q == int(q):
        return str(int(q))
    return str(q).replace(".", "_")


def variable_gltf(q, label):
    return os.path.join(OUTPUT_DIR, f"flowfield_{q_label(q)}_{label}.gltf")

# ----------------------------------------------------------------------
# Surface export
# ----------------------------------------------------------------------
def export_surface():
    print(f"[surface] reading {SURFACE_PVTU}")
    surface = XMLPartitionedUnstructuredGridReader(
        registrationName="surface", FileName=[SURFACE_PVTU]
    )
    view = GetActiveViewOrCreate("RenderView")
    Show(surface, view)
    ResetCamera(view)
    out = os.path.join(OUTPUT_DIR, "surface.gltf")
    print(f"[surface] exporting -> {out}")
    # ParaView 6.x exports glTF (text + .bin sidecars). The frontend reads
    # .gltf directly; if you want a single .glb container, post-process
    # with the Blender embed step (scripts/blender_embed.py converts
    # to GLB on export).
    ExportView(out, view=view)
    Hide(surface, view)
    Delete(surface)
    del surface

# ----------------------------------------------------------------------
# Flowfield pipeline per Q value
# ----------------------------------------------------------------------
def process_flowfield():
    print(f"[flowfield] reading {FLOWFIELD_PVTU}")
    flow = XMLPartitionedUnstructuredGridReader(
        registrationName="flowfield", FileName=[FLOWFIELD_PVTU]
    )

    # Restrict to variables of interest if available (Pipeline only loads what's needed).
    requested = [
        "Pressure", "Velocity", "Density",
        "TurbulentEnergyKinetic", "ViscosityEddy", "TurbulentDissipationRate",
    ]
    try:
        flow.CellArrayStatus = requested
    except Exception:
        pass

    # 1) Gradient with Q-Criterion enabled.
    print("[flowfield] applying Gradient (Q-Criterion on Velocity)")
    gradient = Gradient(registrationName="Gradient1", Input=flow)
    gradient.ScalarArray = ["CELLS", "Velocity"]
    # The Q-criterion is the only field consumed downstream (Contour input).
    # Disabling ComputeGradient avoids materialising a 9-component vector
    # field that nothing reads.
    gradient.ComputeGradient = 0
    gradient.ComputeQCriterion = 1
    gradient.QCriterionArrayName = "Q-criterion"

    # 2) CellDataToPointData
    print("[flowfield] applying CellDataToPointData")
    c2p = CellDatatoPointData(
        registrationName="CellDataToPointData1", Input=gradient
    )
    c2p.PassCellData = 0

    view = GetActiveViewOrCreate("RenderView")

    # Per-Q loop — build contour + decimate once, then export one
    # glTF per variable (each with vertex colors baked from ColorBy).
    for q in Q_VALUES:
        print(f"\n[flowfield] === Q = {q} ===")

        contour = Contour(registrationName=f"Contour_Q{q}", Input=c2p)
        contour.ContourBy = ["POINTS", "Q-criterion"]
        contour.Isosurfaces = [q]
        contour.PointMergeMethod = "Uniform Binning"
        contour.GenerateTriangles = 1


        display = Show(contour, view)
        Hide(c2p, view)
        ResetCamera(view)
        Render(view)

        for var_name, var_label, var_range, component in VARIABLES:
            if component == "Magnitude":
                ColorBy(display, ("POINTS", var_name, "Magnitude"))
            elif isinstance(component, int):
                comp_name = ["X", "Y", "Z"][component]
                ColorBy(display, ("POINTS", var_name, comp_name))
            else:
                ColorBy(display, ("POINTS", var_name))

            try:
                lut = GetColorTransferFunction(var_name)
                lut.RescaleTransferFunction(var_range[0], var_range[1])
            except Exception as exc:
                # A silently-swallowed rescale leaves the GLB with whatever
                # range ParaView auto-derived, which produces wrong colors
                # downstream. Log loudly and flush so the failure surfaces
                # even when stdout is captured by the GUI/launcher.
                print(
                    f"  [ERROR] could not rescale {var_name} to {var_range}: {exc}. "
                    f"Exported GLB will have the WRONG color range.",
                    file=sys.stderr,
                    flush=True,
                )
                sys.stdout.flush()

            Render(view)

            # Per-variable glTF (vertex-color baked).
            gltf_path = variable_gltf(q, var_label)
            print(f"  [{var_label}] glTF -> {gltf_path}  range={var_range}")
            ExportView(gltf_path, view=view)

        Hide(contour, view)
        Delete(contour)


def main():
    print("=" * 70)
    print("TFG ParaView pipeline")
    print("=" * 70)
    print(f"Project root      : {PROJECT_ROOT}")
    print(f"Q values          : {Q_VALUES}")
    print(f"Variables         : {[v[0] for v in VARIABLES]}")
    print()

    export_surface()
    process_flowfield()

    print()
    print("=" * 70)
    print("Pipeline summary")
    print("=" * 70)
    print(f"Filters: Gradient (Q-Criterion on Velocity)")
    print(f"      -> CellDataToPointData (PassCellData=0)")
    print(f"      -> Contour by Q-criterion at {Q_VALUES}")
    print(f"      (No ParaView Decimate — decimation done in Blender)")
    print(f"Outputs in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
