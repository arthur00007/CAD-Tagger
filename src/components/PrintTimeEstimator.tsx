import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  Timer,
  Zap,
  Gauge,
  Layers,
  Thermometer,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sliders,
  Scale,
  Sparkles,
  Info,
  Flame,
} from 'lucide-react';
import { FilamentOption, GeometryData, PrinterEcosystem } from '../types/cad';
import {
  calculatePrintDuration,
  LayerHeightPreset,
  SpeedPreset,
  PrintTimeEstimateResult,
  resolveFilament,
  resolvePrinter,
} from '../utils/printTimeCalculator';

export interface PrintTimeEstimatorProps {
  volumeCm3: number;
  geometryData?: GeometryData | null;
  filament?: FilamentOption | string | null;
  printer?: PrinterEcosystem | string | null;
  targetPrinterModel?: string;
  infillPercent?: number;
  nozzleDiameter?: string;
  compact?: boolean;
  className?: string;
  showInteractiveControls?: boolean;
  onEstimatedTimeCalculated?: (formattedTime: string, totalMinutes: number) => void;
}

export const PrintTimeEstimator: React.FC<PrintTimeEstimatorProps> = ({
  volumeCm3,
  geometryData,
  filament,
  printer,
  targetPrinterModel,
  infillPercent = 20,
  nozzleDiameter = '0.4mm',
  compact = false,
  className = '',
  showInteractiveControls = true,
  onEstimatedTimeCalculated,
}) => {
  const [selectedSpeed, setSelectedSpeed] = useState<SpeedPreset>('standard');
  const [selectedLayerHeight, setSelectedLayerHeight] = useState<LayerHeightPreset>(0.2);
  const [showPhases, setShowPhases] = useState<boolean>(false);

  // Parse nozzle numeric
  const nozzleNum = parseFloat(nozzleDiameter) || 0.4;

  // Compute print estimation
  const estimate: PrintTimeEstimateResult = useMemo(() => {
    return calculatePrintDuration({
      volumeCm3,
      geometryData,
      filament,
      printer,
      targetPrinterModel,
      infillPercent,
      nozzleDiameterMm: nozzleNum,
      layerHeightMm: selectedLayerHeight,
      speedPreset: selectedSpeed,
    });
  }, [
    volumeCm3,
    geometryData,
    filament,
    printer,
    targetPrinterModel,
    infillPercent,
    nozzleNum,
    selectedLayerHeight,
    selectedSpeed,
  ]);

  // Report to parent if listener attached
  useEffect(() => {
    if (onEstimatedTimeCalculated) {
      onEstimatedTimeCalculated(estimate.formattedTime, estimate.totalMinutes);
    }
  }, [estimate.formattedTime, estimate.totalMinutes, onEstimatedTimeCalculated]);

  const activeFilament = resolveFilament(filament);
  const activePrinter = resolvePrinter(printer);

  // Speed preset definitions
  const speedOptions: { id: SpeedPreset; label: string; icon: string; speedMult: string }[] = [
    { id: 'silent', label: 'Silent', icon: '🤫', speedMult: '65%' },
    { id: 'standard', label: 'Standard', icon: '⚡', speedMult: '100%' },
    { id: 'sport', label: 'Sport', icon: '🚀', speedMult: '130%' },
    { id: 'ludicrous', label: 'Ludicrous', icon: '🔥', speedMult: '160%' },
  ];

  // Layer height preset definitions
  const layerHeightOptions: { value: LayerHeightPreset; label: string; desc: string }[] = [
    { value: 0.12, label: '0.12mm', desc: 'Fine Detail' },
    { value: 0.16, label: '0.16mm', desc: 'Optimal' },
    { value: 0.2, label: '0.20mm', desc: 'Standard' },
    { value: 0.28, label: '0.28mm', desc: 'Draft / Fast' },
  ];

  // Phase percentage calculation for visual stacked bar
  const totalPhaseMinutes =
    estimate.phases.heatingAndPrepMins +
    estimate.phases.firstLayerMins +
    estimate.phases.perimetersMins +
    estimate.phases.infillMins +
    estimate.phases.supportMins +
    estimate.phases.travelAndRetractionMins;

  const getPhasePercent = (mins: number) => {
    if (totalPhaseMinutes <= 0) return 0;
    return Math.max(2, Math.round((mins / totalPhaseMinutes) * 100));
  };

  // ---------------------------------------------------------------------------
  // COMPACT VIEW
  // ---------------------------------------------------------------------------
  if (compact) {
    return (
      <div
        className={`px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs ${className}`}
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-mono text-slate-400">Est. Print Time</div>
            <div className="font-bold text-slate-100 font-mono text-sm leading-tight">
              {estimate.formattedTime}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 text-[11px] font-mono text-slate-400 border-l border-slate-800 pl-3">
          <div>
            <span className="text-slate-500">Weight: </span>
            <span className="text-slate-200 font-semibold">{estimate.filamentWeightGrams}g</span>
          </div>
          <div>
            <span className="text-slate-500">Layers: </span>
            <span className="text-slate-200 font-semibold">{estimate.totalLayers}</span>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // FULL INTERACTIVE PRINT TIME ESTIMATOR CARD
  // ---------------------------------------------------------------------------
  return (
    <div
      className={`p-4 bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 rounded-xl shadow-lg flex flex-col gap-3.5 ${className}`}
    >
      {/* Top Banner: Estimated Duration & Quick Badges */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 text-cyan-400 shadow-inner">
            <Timer className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-mono tracking-wider text-cyan-400 font-semibold">
                Print Time Estimator
              </span>
              <span className="px-1.5 py-0.2 text-[9px] font-mono uppercase bg-slate-800 border border-slate-700 text-slate-300 rounded">
                Kinematic Calc
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-white drop-shadow">
                {estimate.formattedTime}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                (~{estimate.totalMinutes} mins total)
              </span>
            </div>
          </div>
        </div>

        {/* Printer & Filament Context Badge */}
        <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1 text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span className="text-slate-200 font-semibold">
              {targetPrinterModel || activePrinter.popularModels[0]}
            </span>
            <span className="text-slate-500 text-[10px]">({estimate.printerCategory})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full border border-slate-700"
              style={{ backgroundColor: activeFilament.color }}
            />
            <span className="text-slate-300">{activeFilament.name.split(' ')[0]}</span>
            <span className="text-slate-500 text-[10px]">
              • {infillPercent}% infill • {nozzleDiameter}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Slicer Controls: Speed Mode & Layer Height */}
      {showInteractiveControls && (
        <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          {/* Speed Preset Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 shrink-0 flex items-center gap-1">
              <Zap className="w-3 h-3 text-amber-400" />
              <span>Speed:</span>
            </span>
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
              {speedOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedSpeed(opt.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-all flex items-center justify-center gap-1 ${
                    selectedSpeed === opt.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`${opt.label} Mode (${opt.speedMult} velocity)`}
                >
                  <span>{opt.icon}</span>
                  <span className="hidden md:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Layer Height Preset Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 shrink-0 flex items-center gap-1">
              <Layers className="w-3 h-3 text-cyan-400" />
              <span>Layer:</span>
            </span>
            <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
              {layerHeightOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedLayerHeight(opt.value)}
                  className={`px-2 py-1 text-[11px] font-mono font-medium rounded transition-all ${
                    selectedLayerHeight === opt.value
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`${opt.desc} (${opt.value}mm)`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Visual Stacked Progress Bar of Print Phases */}
      <div className="flex flex-col gap-1.5 pt-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Print Phase Allocation</span>
          <button
            onClick={() => setShowPhases(!showPhases)}
            className="text-cyan-400 hover:text-cyan-300 text-[10px] font-mono flex items-center gap-0.5"
          >
            <span>{showPhases ? 'Hide Breakdown' : 'View Time Breakdown'}</span>
            {showPhases ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Stacked Multi-Color Bar */}
        <div className="w-full h-2.5 rounded-full bg-slate-950 border border-slate-800 flex overflow-hidden p-0.5 gap-0.5">
          {/* Prep & Heating */}
          <div
            className="h-full bg-amber-500 rounded-sm"
            style={{ width: `${getPhasePercent(estimate.phases.heatingAndPrepMins)}%` }}
            title={`Heating & Calibration: ${estimate.phases.heatingAndPrepMins}m`}
          />
          {/* First Layer */}
          <div
            className="h-full bg-emerald-500 rounded-sm"
            style={{ width: `${getPhasePercent(estimate.phases.firstLayerMins)}%` }}
            title={`First Layer Adhesion: ${estimate.phases.firstLayerMins}m`}
          />
          {/* Perimeters & Walls */}
          <div
            className="h-full bg-cyan-500 rounded-sm"
            style={{ width: `${getPhasePercent(estimate.phases.perimetersMins)}%` }}
            title={`Perimeters & Shells: ${estimate.phases.perimetersMins}m`}
          />
          {/* Infill */}
          <div
            className="h-full bg-blue-500 rounded-sm"
            style={{ width: `${getPhasePercent(estimate.phases.infillMins)}%` }}
            title={`Internal Infill (${infillPercent}%): ${estimate.phases.infillMins}m`}
          />
          {/* Support if any */}
          {estimate.phases.supportMins > 0 && (
            <div
              className="h-full bg-rose-500 rounded-sm"
              style={{ width: `${getPhasePercent(estimate.phases.supportMins)}%` }}
              title={`Overhang Supports: ${estimate.phases.supportMins}m`}
            />
          )}
          {/* Travel & Retractions */}
          <div
            className="h-full bg-indigo-500 rounded-sm"
            style={{ width: `${getPhasePercent(estimate.phases.travelAndRetractionMins)}%` }}
            title={`Travel & Retraction: ${estimate.phases.travelAndRetractionMins}m`}
          />
        </div>

        {/* Phase Color Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 font-mono mt-0.5">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-amber-500" />
            <span>Prep {estimate.phases.heatingAndPrepMins}m</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" />
            <span>Base {estimate.phases.firstLayerMins}m</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-cyan-500" />
            <span>Walls {estimate.phases.perimetersMins}m</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-blue-500" />
            <span>Infill {estimate.phases.infillMins}m</span>
          </div>
          {estimate.phases.supportMins > 0 && (
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-rose-500" />
              <span>Support {estimate.phases.supportMins}m</span>
            </div>
          )}
        </div>
      </div>

      {/* Expandable Detailed Phase Breakdown */}
      {showPhases && (
        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex flex-col gap-2 text-xs font-mono animate-in fade-in duration-200">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between border-b border-slate-800 pb-1">
            <span>Detailed Slicing Phase Audit</span>
            <span className="text-[10px] text-slate-500">Volumetric Kinematic Analysis</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="p-2 bg-slate-900/60 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Nozzle & Bed Heating</span>
              <span className="font-bold text-amber-300">
                {estimate.phases.heatingAndPrepMins} mins
              </span>
            </div>
            <div className="p-2 bg-slate-900/60 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">First Layer Slow Extrusion</span>
              <span className="font-bold text-emerald-300">{estimate.phases.firstLayerMins} mins</span>
            </div>
            <div className="p-2 bg-slate-900/60 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Outer & Inner Perimeters</span>
              <span className="font-bold text-cyan-300">{estimate.phases.perimetersMins} mins</span>
            </div>
            <div className="p-2 bg-slate-900/60 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Internal Sparse Infill</span>
              <span className="font-bold text-blue-300">{estimate.phases.infillMins} mins</span>
            </div>
            <div className="p-2 bg-slate-900/60 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Overhang Supports</span>
              <span className="font-bold text-rose-300">
                {estimate.phases.supportMins > 0 ? `${estimate.phases.supportMins} mins` : '0 mins'}
              </span>
            </div>
            <div className="p-2 bg-slate-900/60 rounded border border-slate-800/80">
              <span className="text-slate-400 text-[10px] block">Travel & Retractions</span>
              <span className="font-bold text-indigo-300">
                {estimate.phases.travelAndRetractionMins} mins
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Slicer Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-800/80 text-xs font-mono">
        {/* Filament Mass */}
        <div className="p-2 bg-slate-950/80 border border-slate-800/80 rounded-lg flex flex-col">
          <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Scale className="w-3 h-3 text-cyan-400" />
            <span>Filament Weight</span>
          </span>
          <span className="font-bold text-slate-200 mt-0.5">
            {estimate.filamentWeightGrams} g
          </span>
        </div>

        {/* Spool Length */}
        <div className="p-2 bg-slate-950/80 border border-slate-800/80 rounded-lg flex flex-col">
          <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Sliders className="w-3 h-3 text-emerald-400" />
            <span>Filament Length</span>
          </span>
          <span className="font-bold text-slate-200 mt-0.5">
            {estimate.filamentLengthMeters} m
          </span>
        </div>

        {/* Total Layers */}
        <div className="p-2 bg-slate-950/80 border border-slate-800/80 rounded-lg flex flex-col">
          <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Layers className="w-3 h-3 text-amber-400" />
            <span>Total Layers</span>
          </span>
          <span className="font-bold text-slate-200 mt-0.5">
            {estimate.totalLayers}
          </span>
        </div>

        {/* Volumetric Speed */}
        <div className="p-2 bg-slate-950/80 border border-slate-800/80 rounded-lg flex flex-col">
          <span className="text-[10px] text-slate-500 uppercase flex items-center gap-1">
            <Gauge className="w-3 h-3 text-purple-400" />
            <span>Max Flow Cap</span>
          </span>
          <span className="font-bold text-slate-200 mt-0.5">
            {estimate.effectiveVolumetricFlowMm3s} mm³/s
          </span>
        </div>
      </div>
    </div>
  );
};
