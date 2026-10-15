/**
 * 3D Printing Print Time Estimator Utility
 * Accurately models FDM slicer kinematic time calculations:
 * - Shell (perimeters + top/bottom solid layers)
 * - Infill extrusion based on infill percentage
 * - Support material volume based on overhang percentage
 * - Printer ecosystem kinematics (CoreXY vs Bedslinger speeds and accelerations)
 * - Material-dependent max volumetric flow limits (mm³/s)
 * - Thermal pre-heating and auto-bed leveling overhead
 */

import { FilamentOption, GeometryData, PrinterEcosystem } from '../types/cad';
import { FILAMENT_PRESETS, PRINTER_ECOSYSTEMS } from './constants';

export type SpeedPreset = 'silent' | 'standard' | 'sport' | 'ludicrous';
export type LayerHeightPreset = 0.12 | 0.16 | 0.20 | 0.28;

export interface PrintTimeEstimateInput {
  volumeCm3: number;
  geometryData?: GeometryData | null;
  filament?: FilamentOption | string | null;
  printer?: PrinterEcosystem | string | null;
  targetPrinterModel?: string;
  infillPercent?: number; // 0 - 100
  nozzleDiameterMm?: number; // default 0.4
  layerHeightMm?: LayerHeightPreset | number; // default 0.20
  speedPreset?: SpeedPreset; // default 'standard'
}

export interface PhaseBreakdown {
  heatingAndPrepMins: number;
  firstLayerMins: number;
  perimetersMins: number;
  infillMins: number;
  supportMins: number;
  travelAndRetractionMins: number;
}

export interface PrintTimeEstimateResult {
  totalMinutes: number;
  hours: number;
  minutes: number;
  formattedTime: string; // e.g. "2h 35m" or "48m"
  phases: PhaseBreakdown;
  filamentWeightGrams: number;
  filamentLengthMeters: number;
  totalLayers: number;
  effectiveVolumetricFlowMm3s: number;
  maxVolumetricCapMm3s: number;
  printerCategory: 'CoreXY High-Speed' | 'Bedslinger Cartesian' | 'Toolchanger / Heavy';
  filamentDensity: number;
}

/**
 * Resolves filament preset or fallback
 */
export function resolveFilament(filament?: FilamentOption | string | null): FilamentOption {
  if (filament && typeof filament === 'object' && 'density' in filament) {
    return filament;
  }
  if (typeof filament === 'string') {
    const found = FILAMENT_PRESETS.find(
      (f) =>
        f.id.toLowerCase() === filament.toLowerCase() ||
        f.name.toLowerCase().includes(filament.toLowerCase())
    );
    if (found) return found;
  }
  return FILAMENT_PRESETS[0]; // PLA fallback
}

/**
 * Resolves printer ecosystem or fallback
 */
export function resolvePrinter(printer?: PrinterEcosystem | string | null): PrinterEcosystem {
  if (printer && typeof printer === 'object' && 'brand' in printer) {
    return printer;
  }
  if (typeof printer === 'string') {
    const found = PRINTER_ECOSYSTEMS.find(
      (p) =>
        p.id.toLowerCase() === printer.toLowerCase() ||
        p.brand.toLowerCase().includes(printer.toLowerCase())
    );
    if (found) return found;
  }
  return PRINTER_ECOSYSTEMS[0]; // Bambu fallback
}

/**
 * Calculates print duration and slicing telemetry
 */
export function calculatePrintDuration(input: PrintTimeEstimateInput): PrintTimeEstimateResult {
  const volumeCm3 = Math.max(0.1, input.volumeCm3 || 1);
  const totalVolumeMm3 = volumeCm3 * 1000;
  const geom = input.geometryData;

  const filament = resolveFilament(input.filament);
  const printer = resolvePrinter(input.printer);
  const modelName = input.targetPrinterModel || printer.popularModels[0] || '';

  const infillPercent = Math.min(100, Math.max(5, input.infillPercent ?? 20));
  const nozzleDia = input.nozzleDiameterMm ?? 0.4;
  const layerHeight = input.layerHeightMm ?? 0.2;
  const speedPreset = input.speedPreset ?? 'standard';

  // 1. Printer Kinematics & Maximum Volumetric Flow (mm³/s)
  const isCoreXY =
    printer.id === 'bambu' ||
    printer.id === 'voron' ||
    modelName.toLowerCase().includes('k1') ||
    modelName.toLowerCase().includes('core');

  const isBedslinger = !isCoreXY && printer.id !== 'voron';

  const printerCategory: 'CoreXY High-Speed' | 'Bedslinger Cartesian' | 'Toolchanger / Heavy' =
    printer.brand.includes('XL')
      ? 'Toolchanger / Heavy'
      : isCoreXY
      ? 'CoreXY High-Speed'
      : 'Bedslinger Cartesian';

  // Base volumetric flow capability of hotend
  let hotendMaxFlowMm3s = 15; // default standard V6 / Volcano
  if (isCoreXY) {
    hotendMaxFlowMm3s = 24; // High flow Bambu / Rapido
  } else if (printer.id === 'prusa') {
    hotendMaxFlowMm3s = 18; // Nextruder
  } else {
    hotendMaxFlowMm3s = 12; // Standard Ender
  }

  // Material Flow Penalty (TPU is slow, PC/PA-CF has viscosity limits)
  let materialFlowFactor = 1.0;
  if (filament.id.includes('tpu')) {
    materialFlowFactor = 0.25; // TPU prints at 3-5 mm³/s
  } else if (filament.id.includes('petg')) {
    materialFlowFactor = 0.85;
  } else if (filament.id.includes('abs') || filament.id.includes('asa')) {
    materialFlowFactor = 0.95;
  } else if (filament.id.includes('pc') || filament.id.includes('pa_cf')) {
    materialFlowFactor = 0.75;
  }

  const maxVolumetricCapMm3s = hotendMaxFlowMm3s * materialFlowFactor;

  // Speed Mode Multipliers
  let speedMultiplier = 1.0;
  if (speedPreset === 'silent') speedMultiplier = 0.65;
  if (speedPreset === 'sport') speedMultiplier = 1.30;
  if (speedPreset === 'ludicrous') speedMultiplier = 1.60;

  // Effective printing volumetric rate
  // High detail layers (e.g. 0.12mm) have lower volumetric efficiency due to acceleration limits
  const layerEfficiencyFactor = Math.min(1.0, 0.6 + (layerHeight / 0.2) * 0.4);
  const effectiveVolumetricFlow = Math.min(
    maxVolumetricCapMm3s * speedMultiplier * layerEfficiencyFactor,
    maxVolumetricCapMm3s * 1.25
  );

  // 2. Extrusion Volume Decomposition: Shells, Infill & Support
  // Shell thickness ~ 1.2mm (3 perimeters of 0.4mm or 2 perimeters of 0.6mm)
  const surfaceAreaMm2 = geom?.surfaceAreaCm2 ? geom.surfaceAreaCm2 * 100 : volumeCm3 * 300;
  const estimatedShellVolumeMm3 = Math.min(totalVolumeMm3 * 0.7, surfaceAreaMm2 * 1.0);
  const internalCoreVolumeMm3 = Math.max(0, totalVolumeMm3 - estimatedShellVolumeMm3);
  const infillVolumeMm3 = internalCoreVolumeMm3 * (infillPercent / 100);

  // Overhang Support Volume
  const overhangFraction = (geom?.overhangPercentage ?? 10) / 100;
  // Support material is sparse (~15% density grid)
  const supportVolumeMm3 = overhangFraction > 0.05 ? totalVolumeMm3 * overhangFraction * 0.25 : 0;

  const totalExtrudedVolumeMm3 = estimatedShellVolumeMm3 + infillVolumeMm3 + supportVolumeMm3;

  // 3. Time Breakdown by Print Phases
  // Prep & Heating (mins)
  let heatingAndPrepMins = 3.5;
  if (filament.bedTemp >= 90) heatingAndPrepMins += 3.0; // ABS / PC bed takes longer
  if (printer.id === 'bambu') heatingAndPrepMins += 2.0; // LiDAR calibration & nozzle cleaning
  if (printer.id === 'prusa') heatingAndPrepMins += 1.5; // Loadcell leveling

  // Extrusion seconds based on volumetric speeds:
  // Perimeters print slower for surface quality (0.75x)
  const perimeterSecs = (estimatedShellVolumeMm3 / (effectiveVolumetricFlow * 0.75));
  // Infill can print at full volumetric speed (1.1x)
  const infillSecs = (infillVolumeMm3 / (effectiveVolumetricFlow * 1.1));
  // Support prints moderately fast (0.9x)
  const supportSecs = (supportVolumeMm3 / (effectiveVolumetricFlow * 0.9));

  // Layer & Z count
  const dimZ = geom?.dimZ ?? Math.cbrt(volumeCm3 * 1000);
  const totalLayers = Math.max(1, Math.round(dimZ / layerHeight));

  // First layer overhead (prints very slow ~ 30-50 mm/s for bed adhesion)
  const firstLayerMins = Math.max(1.5, Math.min(8.0, (surfaceAreaMm2 / 4000) * 1.5));

  // Travel moves, decelerations, and retractions:
  // Kinematic penalty is higher for bedslingers than CoreXY
  const kinematicPenaltyFactor = isCoreXY ? 1.12 : 1.25;
  const totalExtrusionSecs = (perimeterSecs + infillSecs + supportSecs) * kinematicPenaltyFactor;

  const perimetersMins = Math.max(0.5, (perimeterSecs * kinematicPenaltyFactor) / 60);
  const infillMins = Math.max(0.2, (infillSecs * kinematicPenaltyFactor) / 60);
  const supportMins = supportSecs > 0 ? (supportSecs * kinematicPenaltyFactor) / 60 : 0;

  // Travel, Z hops & retractions
  const travelAndRetractionMins = Math.max(1.0, (totalLayers * 0.8) / 60 + totalExtrusionSecs * 0.08 / 60);

  // Total Duration
  const totalMinutes = Math.round(
    heatingAndPrepMins + firstLayerMins + perimetersMins + infillMins + supportMins + travelAndRetractionMins
  );

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  let formattedTime = '';
  if (hours > 0) {
    formattedTime = `${hours}h ${minutes}m`;
  } else {
    formattedTime = `${minutes}m`;
  }

  // 4. Filament Consumption
  // 1.75mm filament cross section area = PI * (1.75 / 2)^2 ≈ 2.405 mm²
  const filamentAreaMm2 = Math.PI * Math.pow(1.75 / 2, 2);
  const filamentLengthMm = totalExtrudedVolumeMm3 / filamentAreaMm2;
  const filamentLengthMeters = parseFloat((filamentLengthMm / 1000).toFixed(1));
  const filamentWeightGrams = parseFloat(((totalExtrudedVolumeMm3 / 1000) * filament.density).toFixed(1));

  return {
    totalMinutes,
    hours,
    minutes,
    formattedTime,
    phases: {
      heatingAndPrepMins: parseFloat(heatingAndPrepMins.toFixed(1)),
      firstLayerMins: parseFloat(firstLayerMins.toFixed(1)),
      perimetersMins: parseFloat(perimetersMins.toFixed(1)),
      infillMins: parseFloat(infillMins.toFixed(1)),
      supportMins: parseFloat(supportMins.toFixed(1)),
      travelAndRetractionMins: parseFloat(travelAndRetractionMins.toFixed(1)),
    },
    filamentWeightGrams,
    filamentLengthMeters,
    totalLayers,
    effectiveVolumetricFlowMm3s: parseFloat(effectiveVolumetricFlow.toFixed(1)),
    maxVolumetricCapMm3s: parseFloat(maxVolumetricCapMm3s.toFixed(1)),
    printerCategory,
    filamentDensity: filament.density,
  };
}
