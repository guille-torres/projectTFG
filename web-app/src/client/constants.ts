// Shared constants for the web-app frontend.

export type VariableLabel =
  | "Pressure"
  | "Velocity"
  | "Density"
  | "TurbulentEnergyKinetic"
  | "ViscosityEddy"
  | "TurbulentDissipationRate";

export interface VariableMeta {
  key: VariableLabel;     // Matches the GLB filename suffix.
  buttonLabel: string;    // Compact label for the variable picker.
  legendLabel: string;    // Verbose title for the colorbar legend.
  unit: string;
  min: number;
  max: number;
  fmt: (v: number) => string;
}

export const VARIABLES: VariableMeta[] = [
  { key: "Pressure",                 buttonLabel: "Pressure",   legendLabel: "Pressure",       unit: "Pa",    min: 26.0,  max: 32.0,    fmt: (v) => v.toFixed(1) },
  { key: "Velocity",                 buttonLabel: "Velocity",   legendLabel: "Velocity |U|",   unit: "m/s",   min: 0.0,   max: 3.0,     fmt: (v) => v.toFixed(1) },
  { key: "Density",                  buttonLabel: "Density",    legendLabel: "Density",        unit: "kg/m³", min: 0.85,  max: 1.0,     fmt: (v) => v.toFixed(2) },
  { key: "TurbulentEnergyKinetic",   buttonLabel: "TKE",        legendLabel: "TKE",            unit: "m²/s²", min: 1e-12, max: 1.1e-12, fmt: (v) => v.toExponential(1) },
  { key: "ViscosityEddy",            buttonLabel: "Eddy Visc.", legendLabel: "Eddy Viscosity", unit: "m²/s",  min: 3e-13, max: 3.5e-13, fmt: (v) => v.toExponential(1) },
  { key: "TurbulentDissipationRate", buttonLabel: "TDR",        legendLabel: "TDR",            unit: "m²/s³", min: 2.85,  max: 3.2,     fmt: (v) => v.toFixed(2) },
];

export const VARIABLE_ORDER: VariableLabel[] = VARIABLES.map((v) => v.key);

export const VARIABLE_BY_KEY: Record<VariableLabel, VariableMeta> =
  Object.fromEntries(VARIABLES.map((v) => [v.key, v])) as Record<VariableLabel, VariableMeta>;

// Q-criterion stages: numeric value for display + filename-safe label
export const Q_VALUES = [0.001, 0.01, 0.1, 1, 5];
export const Q_LABELS = ["0_001", "0_01", "0_1", "1", "5"];
