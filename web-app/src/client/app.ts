// TFG — BabylonJS frontend.
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  TransformNode,
  SceneLoader,
  WebXRState,
} from "@babylonjs/core";

// Register GLB/GLTF loaders
import "@babylonjs/loaders/glTF";

import { updateLegend } from "./legend";
import {
  VariableLabel,
  VARIABLES,
  VARIABLE_ORDER,
  Q_VALUES,
  Q_LABELS,
} from "./constants";

export type { VariableLabel };

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

// Per-Q entry: parent root + one subroot per variable.
interface FlowfieldEntry {
  root: TransformNode;                          // parent of all imported meshes for this Q
  variableRoots: (TransformNode | null)[];      // indexed by VARIABLE_ORDER; setEnabled to swap
  loaded: boolean;                              // false → using mock fallback
}

interface State {
  qIndex: number;
  variable: VariableLabel;
  flowfields: Map<number, FlowfieldEntry>; // keyed by qIndex
}

const state: State = {
  qIndex: 0,
  variable: "Pressure",
  flowfields: new Map(),
};

// Desktop-only orientation offset (rotation around world Y). Set on the
// `desktopViewGroup` parent below; neutralised on XR entry so the headset
// sees the unrotated world.
const DESKTOP_VIEW_ROTATION_Y = Math.PI / 2;
let desktopViewGroup: TransformNode | null = null;

function getDesktopViewGroup(scene: Scene): TransformNode {
  if (!desktopViewGroup) {
    desktopViewGroup = new TransformNode("desktop_view_group", scene);
    desktopViewGroup.rotation.y = DESKTOP_VIEW_ROTATION_Y;
  }
  return desktopViewGroup;
}

// Active XR placement — when non-null, newly created roots are positioned /
// scaled to match the current AR or VR session's anchor.
let xrPlacement: { position: Vector3; scaling: Vector3 } | null = null;

// Orientation correction in WORLD space (camera-independent so VR / AR
// stay consistent with desktop).
const MESH_ROTATION_Y = Math.PI/2;
const MESH_ROTATION_X = 0;
const MESH_ROTATION_Z = Math.PI/2;

// Load timing — exposed on window for the Thesis figure (W3).
interface LoadTimings {
  perMeshMs: Record<string, number>;
  totalMs: number | null;
  start: number | null;
  end: number | null;
}
const loadTimings: LoadTimings = {
  perMeshMs: {},
  totalMs: null,
  start: null,
  end: null,
};
(window as any).__meshLoadTimings = loadTimings;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatus(msg: string) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

function updateLoadingProgress(loaded: number, total: number) {
  const el = document.getElementById("loading-progress");
  if (el) el.textContent = `Cargando mallas... ${loaded}/${total}`;
}

function showLoadingOverlay() {
  const el = document.getElementById("loading-overlay");
  if (el) el.style.display = "flex";
}

function hideLoadingOverlay() {
  const el = document.getElementById("loading-overlay");
  if (el) el.style.display = "none";
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

window.addEventListener("DOMContentLoaded", async () => {
  const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.05, 0.07, 1);

  const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 2.5, 8, Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 0.5;
  camera.upperRadiusLimit = 50;
  camera.wheelDeltaPercentage = 0.01;

  // Brighter lighting — do NOT force unlit/emissive white (regresses PBR baked colors)
  const light1 = new HemisphericLight("light1", new Vector3(0, 1, 0), scene);
  light1.intensity = 1.5;
  light1.groundColor = new Color3(0.3, 0.3, 0.4);
  const light2 = new DirectionalLight("light2", new Vector3(-1, -2, -1), scene);
  light2.intensity = 0.8;
  const light3 = new DirectionalLight("light3", new Vector3(1, -1, 1), scene);
  light3.intensity = 0.5;
  scene.ambientColor = new Color3(0.4, 0.4, 0.45);

  // Surface loads independently — small (~88 KB) and orthogonal to the flowfield load.
  void loadSurface(scene);

  // Load all 30 flowfield GLBs (5 Q × 6 variables) in parallel, hidden,
  // with progress overlay.
  await loadAllFlowfields(scene);

  // Activate the default Q + variable.
  applyVariableToVisible(state.qIndex, state.variable);
  setEnabledForQ(state.qIndex, true);

  updateLegend(state.variable);
  bindUI(scene);

  await initXR(scene, canvas);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
});

// ---------------------------------------------------------------------------
// 30-GLB parallel load (5 Q × 6 variables) with progress overlay
// ---------------------------------------------------------------------------

async function loadAllFlowfields(scene: Scene): Promise<void> {
  showLoadingOverlay();
  updateLoadingProgress(0, Q_VALUES.length);
  loadTimings.start = performance.now();
  let completed = 0;

  const promises = Q_VALUES.map((qVal, qIndex) => {
    const tStart = performance.now();
    return loadFlowfieldQ(scene, qIndex)
      .then(() => {
        const dt = performance.now() - tStart;
        loadTimings.perMeshMs[Q_LABELS[qIndex]] = dt;
        completed += 1;
        updateLoadingProgress(completed, Q_VALUES.length);
        console.log(`[load] Q=${qVal} ready in ${dt.toFixed(1)}ms`);
      })
      .catch((err) => {
        // Failure already handled inside loadFlowfieldQ via mock fallback.
        const dt = performance.now() - tStart;
        loadTimings.perMeshMs[Q_LABELS[qIndex]] = dt;
        completed += 1;
        updateLoadingProgress(completed, Q_VALUES.length);
        console.warn(`[load] Q=${qVal} fell back to mock after ${dt.toFixed(1)}ms`, err);
      });
  });

  await Promise.all(promises);
  loadTimings.end = performance.now();
  loadTimings.totalMs = loadTimings.end - (loadTimings.start ?? loadTimings.end);
  console.log(`[load] ALL Q stages ready in ${loadTimings.totalMs.toFixed(1)}ms`);
  console.log("[load] per-mesh timings:", loadTimings.perMeshMs);
  hideLoadingOverlay();
}

async function loadFlowfieldQ(scene: Scene, qIndex: number): Promise<void> {
  const qLabel = Q_LABELS[qIndex];
  const qDisplay = Q_VALUES[qIndex];

  const root = new TransformNode(`flowfield_root_${qLabel}`, scene);
  root.parent = getDesktopViewGroup(scene);
  root.rotation.x = MESH_ROTATION_X;
  root.rotation.y = MESH_ROTATION_Y;
  root.rotation.z = MESH_ROTATION_Z;
  root.setEnabled(false); // start hidden

  const variableRoots: (TransformNode | null)[] = new Array(VARIABLE_ORDER.length).fill(null);
  let anyLoaded = false;

  await Promise.all(VARIABLE_ORDER.map(async (variable, idx) => {
    const file = `flowfield_${qLabel}_${variable}.glb`;
    const sub = new TransformNode(`flowfield_${qLabel}_${variable}`, scene);
    sub.parent = root;
    sub.setEnabled(variable === state.variable);
    try {
      const result = await SceneLoader.ImportMeshAsync("", "./output/blender/", file, scene);
      result.meshes.forEach((m) => {
        if (!m.parent || (m.parent as any) === scene) m.parent = sub;
        (m as any).metadata = { kind: "flowfield", q: qDisplay, variable };
        if (m.material) m.material.backFaceCulling = false;
      });
      variableRoots[idx] = sub;
      anyLoaded = true;
    } catch (err) {
      console.warn(`[flowfield] failed ${file}`, err);
    }
  }));

  if (anyLoaded) {
    state.flowfields.set(qIndex, { root, variableRoots, loaded: true });
    return;
  }

  // Total failure for this Q — fall back to a mock sphere.
  console.warn(`[flowfield] no variants loaded for Q=${qDisplay}, using MOCK`);
  const mockRadius = 1 + Math.log10(qDisplay + 1) * 1.5;
  const mock = MeshBuilder.CreateSphere(
    `flowfield_mock_Q${qLabel}`,
    { diameter: mockRadius * 2, segments: 24 },
    scene,
  );
  mock.parent = root;
  const mat = new StandardMaterial(`flowfield_mock_mat_Q${qLabel}`, scene);
  mat.diffuseColor = mockColorFor(state.variable);
  mat.alpha = 0.7;
  mock.material = mat;
  (mock as any).metadata = { kind: "flowfield", mock: true, q: qDisplay };

  state.flowfields.set(qIndex, { root, variableRoots, loaded: false });
}

// ---------------------------------------------------------------------------
// Variable / Q swap helpers (no GLB reload on variable change)
// ---------------------------------------------------------------------------

function setEnabledForQ(qIndex: number, enabled: boolean) {
  const entry = state.flowfields.get(qIndex);
  if (entry) entry.root.setEnabled(enabled);
}

function applyVariableToEntry(entry: FlowfieldEntry, variable: VariableLabel) {
  const idx = VARIABLE_ORDER.indexOf(variable);
  if (idx < 0) return;
  for (let i = 0; i < entry.variableRoots.length; i++) {
    const sub = entry.variableRoots[i];
    if (sub) sub.setEnabled(i === idx);
  }
}

function applyVariableToVisible(qIndex: number, variable: VariableLabel) {
  // Apply to every loaded entry so a future Q change shows the right colors
  // without an additional swap step. Cheap (just pointer assignments).
  for (const entry of state.flowfields.values()) {
    applyVariableToEntry(entry, variable);
  }
  // Mock fallback: tint the mock sphere if any.
  const cur = state.flowfields.get(qIndex);
  if (cur && !cur.loaded) {
    cur.root.getChildMeshes().forEach((m) => {
      if (m.material instanceof StandardMaterial) {
        m.material.diffuseColor = mockColorFor(variable);
      }
    });
  }
}

async function setVariable(_scene: Scene, variable: VariableLabel) {
  state.variable = variable;
  const buttons = document.querySelectorAll<HTMLButtonElement>("#variable-buttons button");
  buttons.forEach((b) => b.classList.toggle("active", b.dataset.variable === variable));
  updateLegend(variable);
  applyVariableToVisible(state.qIndex, variable);
  setStatus(`Q=${Q_VALUES[state.qIndex]} · ${variable}`);
}

async function setQ(_scene: Scene, qIndex: number) {
  if (qIndex === state.qIndex) return;
  setEnabledForQ(state.qIndex, false);
  state.qIndex = qIndex;

  const slider = document.getElementById("q-slider") as HTMLInputElement | null;
  if (slider) slider.value = String(qIndex);
  const qVal = document.getElementById("q-value");
  if (qVal) qVal.textContent = String(Q_VALUES[qIndex]);

  // Ensure the newly visible mesh reflects the active variable selection.
  const entry = state.flowfields.get(qIndex);
  if (entry) {
    applyVariableToEntry(entry, state.variable);
    // If an XR session is active, place the freshly visible root at the
    // saved XR anchor (same logic the old loadFlowfield used).
    if (xrPlacement) {
      entry.root.scaling.copyFrom(xrPlacement.scaling);
      entry.root.setAbsolutePosition(xrPlacement.position);
    }
    entry.root.setEnabled(true);
  }
  setStatus(`Q=${Q_VALUES[qIndex]} · ${state.variable}`);
}

function cycleVariable(scene: Scene, delta: number) {
  const n = VARIABLE_ORDER.length;
  const i = VARIABLE_ORDER.indexOf(state.variable);
  const next = VARIABLE_ORDER[((i + delta) % n + n) % n];
  void setVariable(scene, next);
}

function cycleQ(scene: Scene, delta: number) {
  const n = Q_VALUES.length;
  const next = ((state.qIndex + delta) % n + n) % n;
  void setQ(scene, next);
}

// ---------------------------------------------------------------------------
// Surface load (unchanged shape)
// ---------------------------------------------------------------------------

async function loadSurface(scene: Scene): Promise<void> {
  setStatus("Cargando superficie...");
  try {
    const result = await SceneLoader.ImportMeshAsync("", "./output/", "surface.glb", scene);
    const root = new TransformNode("surface_root", scene);
    root.parent = getDesktopViewGroup(scene);
    root.rotation.x = MESH_ROTATION_X;
    root.rotation.y = MESH_ROTATION_Y;
    root.rotation.z = MESH_ROTATION_Z;
    result.meshes.forEach((m) => {
      if (!m.parent) m.parent = root;
      (m as any).metadata = { kind: "surface" };
      if (m.material) m.material.backFaceCulling = false;
    });
    setStatus("Superficie cargada");
  } catch (err) {
    console.warn("[surface] real GLB missing, using MOCK box:", err);
    const mock = MeshBuilder.CreateBox("surface_mock", { size: 2 }, scene);
    (mock as any).metadata = { kind: "surface", mock: true };
    setStatus("Superficie MOCK (pipeline pendiente)");
  }
}

function mockColorFor(variable: VariableLabel): Color3 {
  const colors: Record<VariableLabel, [number, number, number]> = {
    Pressure: [0.9, 0.2, 0.2],
    Velocity: [0.2, 0.6, 1.0],
    Density: [0.8, 0.6, 0.2],
    TurbulentEnergyKinetic: [0.6, 0.2, 0.8],
    ViscosityEddy: [0.2, 0.8, 0.6],
    TurbulentDissipationRate: [0.9, 0.5, 0.1],
  };
  const c = colors[variable];
  return new Color3(c[0], c[1], c[2]);
}

// ---------------------------------------------------------------------------
// UI binding
// ---------------------------------------------------------------------------

function bindUI(scene: Scene) {
  // Build variable buttons from the single source of truth in constants.ts.
  const btnContainer = document.getElementById("variable-buttons");
  if (btnContainer) {
    btnContainer.innerHTML = "";
    for (const v of VARIABLES) {
      const btn = document.createElement("button");
      btn.dataset.variable = v.key;
      btn.textContent = v.buttonLabel;
      if (v.key === state.variable) btn.classList.add("active");
      btn.addEventListener("click", () => setVariable(scene, v.key));
      btnContainer.appendChild(btn);
    }
  }

  // Q slider + ticks. Slider already exists in HTML; the tick labels are
  // generated from Q_VALUES so the row never drifts from the actual stages.
  const slider = document.getElementById("q-slider") as HTMLInputElement;
  slider.min = "0";
  slider.max = String(Q_VALUES.length - 1);
  slider.step = "1";
  const ticks = document.querySelector<HTMLDivElement>(".ticks");
  if (ticks) {
    ticks.innerHTML = "";
    for (const q of Q_VALUES) {
      const span = document.createElement("span");
      span.textContent = String(q);
      ticks.appendChild(span);
    }
  }
  const qVal = document.getElementById("q-value");
  if (qVal) qVal.textContent = String(Q_VALUES[state.qIndex]);
  slider.addEventListener("change", () => setQ(scene, parseInt(slider.value, 10)));

  const cheatToggle = document.getElementById("vr-cheatsheet-toggle");
  const cheatList = document.querySelector<HTMLUListElement>("#vr-cheatsheet ul");
  cheatToggle?.addEventListener("click", () => {
    if (!cheatList) return;
    const open = cheatList.hidden;
    cheatList.hidden = !open;
    cheatToggle.setAttribute("aria-expanded", String(open));
    cheatToggle.textContent = open ? "Mandos VR ▾" : "Mandos VR ▸";
  });
}

// ---------------------------------------------------------------------------
// XR initialisation — VR + AR with graceful fallback
// ---------------------------------------------------------------------------

async function initXR(scene: Scene, _canvas: HTMLCanvasElement): Promise<void> {
  const xrSupport = (navigator as any).xr;
  const vrBtn = document.getElementById("enter-vr") as HTMLButtonElement | null;
  const arBtn = document.getElementById("enter-ar") as HTMLButtonElement | null;

  if (!xrSupport) {
    console.warn("[xr] WebXR API not available in this browser");
    if (vrBtn) vrBtn.title = "WebXR no disponible";
    if (arBtn) arBtn.title = "WebXR no disponible";
    return;
  }

  const vrSupported = await xrSupport.isSessionSupported("immersive-vr").catch(() => false);
  const arSupported = await xrSupport.isSessionSupported("immersive-ar").catch(() => false);

  const xr = await scene.createDefaultXRExperienceAsync({
    disableDefaultUI: true,
    disableTeleportation: false,
  });

  if (vrBtn) {
    vrBtn.disabled = !vrSupported;
    vrBtn.title = vrSupported ? "" : "VR no soportado en este dispositivo";
    vrBtn.addEventListener("click", async () => {
      try {
        await xr.baseExperience.enterXRAsync("immersive-vr", "local-floor");
        console.log("[xr] entered immersive-vr");
      } catch (err) {
        console.warn("[xr] VR entry failed:", err);
      }
    });
  }
  if (arBtn) {
    arBtn.disabled = !arSupported;
    arBtn.title = arSupported ? "" : "AR no soportado en este dispositivo";
    arBtn.addEventListener("click", async () => {
      try {
        const overlayRoot = document.getElementById("ui-overlay") ?? document.body;
        await xr.baseExperience.enterXRAsync(
          "immersive-ar",
          "unbounded",
          undefined,
          {
            optionalFeatures: ["dom-overlay", "hit-test"],
            domOverlay: { root: overlayRoot },
          } as any,
        );
        console.log("[xr] entered immersive-ar");
      } catch (err) {
        console.warn("[xr] AR entry failed:", err);
      }
    });
  }

  if (!vrSupported && !arSupported) {
    console.warn("[xr] Neither immersive-vr nor immersive-ar supported on this device");
  }

  // Camera-relative placement on entry — both AR and VR.
  const AR_SCALE = 0.15, AR_FORWARD_DIST = 0.8, AR_VERTICAL = -0.3;
  const VR_SCALE = 0.15, VR_FORWARD_DIST = 0.8, VR_VERTICAL = -0.3;
  const saved = new Map<number, { pos: Vector3; scale: Vector3 }>();

  const collectRoots = () =>
    scene.transformNodes.filter(
      (n) => n.name.startsWith("flowfield_root") || n.name === "surface_root",
    );

  xr.baseExperience.onStateChangedObservable.add((xrState) => {
    const mode = (xr.baseExperience.sessionManager as any)?.sessionMode;
    const isAR = xrState === WebXRState.IN_XR && mode === "immersive-ar";
    const isVR = xrState === WebXRState.IN_XR && mode === "immersive-vr";
    if (isAR || isVR) {
      if (isVR) getDesktopViewGroup(scene).rotation.y = 0;
      const SCALE = isAR ? AR_SCALE : VR_SCALE;
      const FORWARD = isAR ? AR_FORWARD_DIST : VR_FORWARD_DIST;
      const VERT = isAR ? AR_VERTICAL : VR_VERTICAL;
      const cam = xr.baseExperience.camera;
      const fwd = cam.getDirection(Vector3.Forward());
      fwd.y = 0;
      if (fwd.lengthSquared() < 1e-4) fwd.set(0, 0, 1);
      fwd.normalize();
      const target = cam.position.add(fwd.scale(FORWARD));
      target.y += VERT;
      xrPlacement = {
        position: target.clone(),
        scaling: new Vector3(SCALE, SCALE, SCALE),
      };
      for (const r of collectRoots()) {
        saved.set(r.uniqueId, { pos: r.position.clone(), scale: r.scaling.clone() });
        r.scaling.scaleInPlace(SCALE);
        r.setAbsolutePosition(target);
      }
    } else if (xrState === WebXRState.NOT_IN_XR && saved.size > 0) {
      for (const r of collectRoots()) {
        const t = saved.get(r.uniqueId);
        if (t) { r.position.copyFrom(t.pos); r.scaling.copyFrom(t.scale); }
      }
      saved.clear();
      xrPlacement = null;
      getDesktopViewGroup(scene).rotation.y = DESKTOP_VIEW_ROTATION_Y;
    }
  });

  // -------------------------------------------------------------------
  // VR controller bindings — Quest:
  //   right thumbstick:   move active roots in horizontal plane
  //   left  thumbstick Y: scale active roots
  //   A (right) / B (right): next / prev variable
  //   X (left)  / Y (left):  next / prev Q stage
  // -------------------------------------------------------------------
  const MOVE_SPEED = 0.6;
  const SCALE_SPEED = 0.8;
  const STICK_DEAD = 0.15;

  const stickAxes = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };

  xr.input.onControllerAddedObservable.add((controller) => {
    controller.onMotionControllerInitObservable.add((mc) => {
      const hand = mc.handedness;
      const thumbstick = mc.getComponent("xr-standard-thumbstick");
      if (thumbstick) {
        thumbstick.onAxisValueChangedObservable.add((axes) => {
          if (hand === "left")  { stickAxes.left.x = axes.x;  stickAxes.left.y = axes.y;  }
          if (hand === "right") { stickAxes.right.x = axes.x; stickAxes.right.y = axes.y; }
        });
      }
      const wireButton = (id: string, handler: () => void) => {
        const c = mc.getComponent(id);
        if (!c) return;
        let wasPressed = false;
        c.onButtonStateChangedObservable.add(() => {
          if (c.pressed && !wasPressed) handler();
          wasPressed = c.pressed;
        });
      };
      if (hand === "right") {
        wireButton("a-button", () => cycleVariable(scene, +1));
        wireButton("b-button", () => cycleVariable(scene, -1));
      } else if (hand === "left") {
        wireButton("x-button", () => cycleQ(scene, +1));
        wireButton("y-button", () => cycleQ(scene, -1));
      }
    });
  });

  scene.onBeforeRenderObservable.add(() => {
    if (!xrPlacement) return;
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const cam = xr.baseExperience.camera;

    const rx = Math.abs(stickAxes.right.x) > STICK_DEAD ? stickAxes.right.x : 0;
    const ry = Math.abs(stickAxes.right.y) > STICK_DEAD ? stickAxes.right.y : 0;
    if (rx !== 0 || ry !== 0) {
      const fwd = cam.getDirection(Vector3.Forward()); fwd.y = 0; fwd.normalize();
      const right = cam.getDirection(Vector3.Right());  right.y = 0; right.normalize();
      const delta = right.scale(rx * MOVE_SPEED * dt).add(fwd.scale(-ry * MOVE_SPEED * dt));
      xrPlacement.position.addInPlace(delta);
      for (const r of collectRoots()) {
        r.setAbsolutePosition(r.absolutePosition.add(delta));
      }
    }

    const ly = Math.abs(stickAxes.left.y) > STICK_DEAD ? stickAxes.left.y : 0;
    if (ly !== 0) {
      const factor = Math.exp(-ly * SCALE_SPEED * dt);
      xrPlacement.scaling.scaleInPlace(factor);
      for (const r of collectRoots()) r.scaling.scaleInPlace(factor);
    }
  });
}

