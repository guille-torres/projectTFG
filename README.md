# Visualización CFD en WebXR

Aplicación web interactiva para visualizar resultados de simulaciones de
Mecánica de Fluidos Computacional (CFD) en un navegador, con soporte
opcional de Realidad Virtual y Aumentada vía WebXR. Es el resultado del
Trabajo de Fin de Grado *Procesamiento y Visualización de Datos de CFD
para Realidad Virtual y Aumentada* (ETSIAE - UPM).

El caso de estudio es el flujo en torno a un perfil a 90° de
ángulo de ataque en régimen de *Vortex-Induced Vibrations* (VIV), con
isosuperficies de Q-criterion coloreadas según seis variables del campo
fluido.

## Demo

> `https://guille-torres.github.io/projectTFG/`

Compatible con cualquier navegador moderno. Para la sesión inmersiva se
necesita un dispositivo con soporte WebXR (visor VR o móvil con cámara
para AR).

## Estructura del repositorio

```
projectTFG/
├── web-app/          Aplicación cliente (Vite + TypeScript + Babylon.js)
│   ├── public/output/  Mallas .glb listas para servir (94 MB)
│   └── src/client/     Código de la aplicación
├── scripts/          Scripts de preprocesado (ParaView/Blender headless)
└── .github/workflows/ Despliegue automático a GitHub Pages
```

La carpeta `web-app/public/output/` contiene los 30 GLBs del campo fluido
(5 niveles de Q × 6 variables) y `surface.glb` con la geometría del
perfil. Los GLBs ya están optimizados (decimados en Blender y comprimidos
con Draco) y se sirven tal cual; no es necesario el dataset original de
CFD para correr la app.

### Desarrollo local

Requiere Node.js ≥ 20.

```bash
cd web-app
npm install
npm run dev
```

HTTPS auto-firmado (necesario para WebXR). La primera vez el navegador avisa
de certificado no fiable; acepta y continúa.

Para probar desde un móvil en la misma red:

```bash
npm run dev -- --host
```

y abre en el móvil la URL `https://<IP-del-PC>:5173/`.

### Controles

- **Q-criterion (1–5)**: 5 niveles que revelan estructuras vorticales
  de distinto tamaño.
- **Variable**: presión, velocidad, densidad, energía cinética
  turbulenta, viscosidad turbulenta y tasa de disipación.
- **Modo XR**: botones de Realidad Virtual y Realidad Aumentada
  (visibles sólo si el dispositivo los soporta).

## Pipeline de preprocesado

La carpeta `scripts/` contiene el preproceso que convierte la salida del
solver CFD en los GLBs servidos por la app:

- `optimise_pvtu.py` — Filtros de ParaView (Q-criterion, isosuperficies,
  exportación a glTF con LUT de color por variable).
- `blender_embed.py` — Empaquetado en Blender (decimación, compresión
  Draco, *merge by distance*, embebido de textura LUT).

Ver `scripts/README.md` para los pasos detallados.

## Tecnologías

- **[Babylon.js](https://www.babylonjs.com/)**.
- **[Vite](https://vitejs.dev/)**.
- **[glTF / Draco](https://www.khronos.org/gltf/)**.
- **[WebXR Device API](https://www.w3.org/TR/webxr/)**.
- **[ParaView](https://www.paraview.org/)**,
  **[Blender](https://www.blender.org/)**

## Autoría
Autor: Guillermo Torres Pedrares
Tutor: Sergio Ávila Sánchez
