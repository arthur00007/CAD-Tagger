import React from 'react';
import {
  Printer,
  Layers,
  Thermometer,
  Wrench,
  Sparkles,
  ShieldAlert,
  Info,
  Sliders,
  FileCode,
  HardDrive,
  Cpu,
  ShieldCheck,
} from 'lucide-react';
import { FILAMENT_PRESETS, PRINTER_ECOSYSTEMS } from '../utils/constants';
import { SAMPLE_MODELS } from '../utils/sampleModels';
import { FilamentOption, FunctionalIntent, PrinterEcosystem } from '../types/cad';

interface ControlPanelProps {
  selectedPrinter: PrinterEcosystem;
  onSelectPrinter: (printer: PrinterEcosystem) => void;
  targetPrinterModel: string;
  onSelectTargetPrinterModel: (model: string) => void;
  selectedFilament: FilamentOption;
  onSelectFilament: (filament: FilamentOption) => void;
  nozzleTemp: number;
  onNozzleTempChange: (temp: number) => void;
  bedTemp: number;
  onBedTempChange: (temp: number) => void;
  functionalIntent: FunctionalIntent;
  onFunctionalIntentChange: (intent: FunctionalIntent) => void;
  nozzleDiameter: string;
  onNozzleDiameterChange: (diameter: string) => void;
  infillTarget: number;
  onInfillTargetChange: (val: number) => void;
  overhangThreshold: number;
  onOverhangThresholdChange: (angle: number) => void;
  userNotes: string;
  onUserNotesChange: (notes: string) => void;
  onLoadSample: (sampleId: string) => void;
  onTriggerGenerate: () => void;
  isGenerating: boolean;
  hasGeometry: boolean;
  hasSnapshots: boolean;
  onOpenDfAMHub?: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  selectedPrinter,
  onSelectPrinter,
  targetPrinterModel,
  onSelectTargetPrinterModel,
  selectedFilament,
  onSelectFilament,
  nozzleTemp,
  onNozzleTempChange,
  bedTemp,
  onBedTempChange,
  functionalIntent,
  onFunctionalIntentChange,
  nozzleDiameter,
  onNozzleDiameterChange,
  infillTarget,
  onInfillTargetChange,
  overhangThreshold,
  onOverhangThresholdChange,
  userNotes,
  onUserNotesChange,
  onLoadSample,
  onTriggerGenerate,
  isGenerating,
  hasGeometry,
  hasSnapshots,
  onOpenDfAMHub,
}) => {
  return (
    <div className="flex flex-col gap-5 text-slate-200">
      {/* Sample Model Quick Selector */}
      <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Quick Test: Load Pre-Engineered CAD Part</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SAMPLE_MODELS.map((sample) => (
            <button
              key={sample.id}
              onClick={() => onLoadSample(sample.id)}
              className="text-left p-2 rounded-lg border border-slate-800 bg-slate-950/60 hover:bg-cyan-950/30 hover:border-cyan-500/40 transition-all group"
            >
              <div className="text-xs font-medium text-slate-200 group-hover:text-cyan-300 truncate">
                {sample.name}
              </div>
              <div className="text-[10px] text-slate-500 truncate mt-0.5">{sample.category}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Target Printer Ecosystem */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Printer className="w-3.5 h-3.5 text-cyan-400" />
          <span>Printer Ecosystem & Machine</span>
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRINTER_ECOSYSTEMS.map((ecosystem) => {
            const isSelected = selectedPrinter.id === ecosystem.id;
            return (
              <button
                key={ecosystem.id}
                onClick={() => {
                  onSelectPrinter(ecosystem);
                  onSelectTargetPrinterModel(ecosystem.popularModels[0]);
                }}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200 shadow-md shadow-cyan-950/20'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-semibold truncate">{ecosystem.brand}</div>
                <div className="text-[10px] text-slate-500 mt-0.5 truncate">{ecosystem.slicerName}</div>
              </button>
            );
          })}
        </div>

        {/* Specific Printer Model Dropdown */}
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-slate-400 shrink-0">Model:</span>
          <select
            value={targetPrinterModel}
            onChange={(e) => onSelectTargetPrinterModel(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
          >
            {selectedPrinter.popularModels.map((model) => (
              <option key={model} value={model}>
                {model} ({selectedPrinter.bedX}×{selectedPrinter.bedY}×{selectedPrinter.bedZ}mm)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Target Filament Material */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Target Filament Material</span>
          </label>
          <span className="text-[10px] font-mono text-cyan-400">
            Density: {selectedFilament.density} g/cm³
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FILAMENT_PRESETS.map((filament) => {
            const isSelected = selectedFilament.id === filament.id;
            return (
              <button
                key={filament.id}
                onClick={() => onSelectFilament(filament)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200 shadow-md'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold truncate">{filament.name.split(' ')[0]}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: filament.color }}
                  />
                </div>
                <div className="text-[10px] text-slate-500 truncate mt-1">
                  {filament.category}
                </div>
              </button>
            );
          })}
        </div>

        {/* Filament Thermal Specs */}
        <div className="p-2.5 bg-slate-900/70 border border-slate-800 rounded-lg grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Thermometer className="w-3 h-3 text-amber-400" />
              <span>Extrusion Temp</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                value={nozzleTemp}
                onChange={(e) => onNozzleTempChange(Number(e.target.value))}
                className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-slate-200"
              />
              <span className="text-xs text-slate-400">°C</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Thermometer className="w-3 h-3 text-rose-400" />
              <span>Bed Temp</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <input
                type="number"
                value={bedTemp}
                onChange={(e) => onBedTempChange(Number(e.target.value))}
                className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono text-slate-200"
              />
              <span className="text-xs text-slate-400">°C</span>
            </div>
          </div>
        </div>

        {/* Warning Badges for Enclosure or Hardened Nozzle */}
        {(selectedFilament.enclosureRequired || selectedFilament.hardenedNozzleRequired) && (
          <div className="p-2 bg-amber-950/40 border border-amber-500/30 rounded-lg flex items-start gap-2 text-amber-300 text-[11px]">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              {selectedFilament.enclosureRequired && (
                <div>• Enclosure / chamber recommended to prevent corner lifting and layer delamination.</div>
              )}
              {selectedFilament.hardenedNozzleRequired && (
                <div>• Hardened steel or ruby nozzle required (abrasive carbon fibers).</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Functional Intent Selector */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-cyan-400" />
          <span>Functional Intent</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              'Mechanical / Structural',
              'Decorative / Display',
              'Flexible / Gasket',
              'High-Temp / Enclosure',
            ] as FunctionalIntent[]
          ).map((intent) => {
            const isSelected = functionalIntent === intent;
            return (
              <button
                key={intent}
                onClick={() => onFunctionalIntentChange(intent)}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200 shadow-md'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs font-semibold">{intent.split('/')[0]}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{intent.split('/')[1] || 'Design'}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slicing Tuning (Infill, Nozzle, Overhang Threshold) */}
      <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Slicing & Geometry Parameters</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Nozzle Size */}
          <div>
            <label className="text-[10px] text-slate-400">Nozzle Diameter</label>
            <select
              value={nozzleDiameter}
              onChange={(e) => onNozzleDiameterChange(e.target.value)}
              className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="0.2mm">0.2 mm (Ultra Fine / Miniatures)</option>
              <option value="0.4mm">0.4 mm (Standard Universal)</option>
              <option value="0.6mm">0.6 mm (High-Flow / Structural)</option>
              <option value="0.8mm">0.8 mm (Rough Draft / Thick Shells)</option>
            </select>
          </div>

          {/* Overhang Angle Threshold */}
          <div>
            <div className="flex justify-between items-center text-[10px] text-slate-400">
              <span>Overhang Angle Limit</span>
              <span className="font-mono text-cyan-400">{overhangThreshold}°</span>
            </div>
            <input
              type="range"
              min="35"
              max="65"
              step="5"
              value={overhangThreshold}
              onChange={(e) => onOverhangThresholdChange(Number(e.target.value))}
              className="w-full mt-2 accent-cyan-500 cursor-pointer"
            />
            {onOpenDfAMHub && (
              <button
                type="button"
                onClick={onOpenDfAMHub}
                className="mt-2.5 w-full flex items-center justify-between p-2 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 text-xs transition-colors group"
                title="Launch Support-Free DfAM Evaluator to inspect overhang fixes and orientations"
              >
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="font-semibold text-[11px]">Support-Free DfAM Evaluator</span>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono">Inspect Fixes →</span>
              </button>
            )}
          </div>
        </div>

        {/* Infill Target Slider */}
        <div className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between items-center text-[10px] text-slate-400">
            <span>Target Infill Density</span>
            <span className="font-mono text-cyan-400">{infillTarget}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={infillTarget}
            onChange={(e) => onInfillTargetChange(Number(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        {/* Additional Maker Notes */}
        <div className="flex flex-col gap-1 text-xs">
          <label className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>Maker Context / Notes (Optional)</span>
            <span className="text-slate-600">Hardware, fit tolerances, usage</span>
          </label>
          <textarea
            value={userNotes}
            onChange={(e) => onUserNotesChange(e.target.value)}
            placeholder="e.g., Designed to press-fit 608 bearings and M3 heat-set inserts. Needs tight dimensional accuracy."
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none font-sans"
          />
        </div>
      </div>

      {/* Main Trigger Button */}
      <button
        onClick={onTriggerGenerate}
        disabled={!hasGeometry || isGenerating}
        className="w-full py-3.5 px-4 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-lg shadow-cyan-900/20 border border-cyan-400/30 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
      >
        <Sparkles className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
        <span>
          {isGenerating
            ? 'Analyzing 3D Mesh & Generating Slicer Profile...'
            : 'Generate Spec Sheet & Slicer Profile (Gemini)'}
        </span>
      </button>
    </div>
  );
};
