import React, { useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  RotateCw,
  ArrowRight,
  Layers,
  Clock,
  Scale,
  Wrench,
  Info,
  Zap,
  AlertTriangle,
  Eye,
  Flame,
  ChevronDown,
  ChevronUp,
  Download,
  FileCode,
} from 'lucide-react';
import {
  OverhangRegion,
  OrientationAlternative,
  SupportFreeAnalysisResult,
  ModificationType,
} from '../types/cad';
import { analyzeSupportFreeOpportunities } from '../utils/supportFreeAnalyzer';

export interface SupportFreeOptimizerProps {
  geometry: THREE.BufferGeometry | null;
  filamentName?: string;
  filamentDensity?: number;
  overhangThreshold?: number;
  onApplyOrientation?: (axis: 'X' | 'Y' | 'Z', degrees: number) => void;
  onSelectRegion?: (region: OverhangRegion | null) => void;
  selectedRegionId?: string | null;
  className?: string;
}

export const SupportFreeOptimizer: React.FC<SupportFreeOptimizerProps> = ({
  geometry,
  filamentName = 'PLA (Polylactic Acid)',
  filamentDensity = 1.24,
  overhangThreshold = 45,
  onApplyOrientation,
  onSelectRegion,
  selectedRegionId,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState<'regions' | 'orientations' | 'rules' | 'material'>('regions');
  const [filterType, setFilterType] = useState<ModificationType | 'all'>('all');
  const [copiedRegionId, setCopiedRegionId] = useState<string | null>(null);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [expandedRegionId, setExpandedRegionId] = useState<string | null>(null);

  // Analyze support-free opportunities
  const analysis: SupportFreeAnalysisResult | null = useMemo(() => {
    if (!geometry) return null;
    try {
      return analyzeSupportFreeOpportunities(geometry, filamentDensity, filamentName, overhangThreshold);
    } catch (err) {
      console.error('Support-free analysis failed:', err);
      return null;
    }
  }, [geometry, filamentDensity, filamentName, overhangThreshold]);

  if (!geometry || !analysis) {
    return (
      <div className={`p-6 text-center text-slate-400 bg-slate-900/40 border border-slate-800 rounded-xl ${className}`}>
        <Wrench className="w-8 h-8 text-slate-600 mx-auto mb-2 animate-bounce" />
        <p className="text-sm font-medium text-slate-300">No 3D Geometry Loaded</p>
        <p className="text-xs text-slate-500 mt-1">Import a CAD model (.stl or .3mf) to run Support-Free DfAM analysis.</p>
      </div>
    );
  }

  const {
    feasibilityScore,
    rating,
    totalOverhangAreaMm2,
    estimatedSupportFilamentGrams,
    estimatedExtraPrintTimeMinutes,
    regions,
    orientations,
    bestOrientation,
    materialConsiderations,
    summaryAdvice,
  } = analysis;

  // Filtered regions
  const filteredRegions = regions.filter((r) => filterType === 'all' || r.type === filterType);

  // Copy single CAD recipe to clipboard
  const handleCopyRecipe = (region: OverhangRegion) => {
    const text = `CAD Modification: ${region.suggestedModification.title}
Region: ${region.name} (Area: ${region.areaMm2} mm², Height: ${region.elevationMm} mm)
Technique: ${region.suggestedModification.cadTechnique}
Steps:
${region.suggestedModification.cadSteps
  .map((s, i) => `${i + 1}. [${s.tool}] ${s.action} -> ${s.parameterValue}`)
  .join('\n')}
Material Note: ${region.suggestedModification.materialSpecificNote}
Estimated Support Reduction: ${region.suggestedModification.estimatedSavingsPercent}%`;

    navigator.clipboard.writeText(text);
    setCopiedRegionId(region.id);
    setTimeout(() => setCopiedRegionId(null), 2500);
  };

  // Copy full DfAM report
  const handleCopyFullReport = () => {
    const report = `# Support-Free DfAM Engineering Report
Feasibility Score: ${feasibilityScore}/100 (${rating})
Total Overhang Area: ${totalOverhangAreaMm2} mm²
Estimated Support Filament Waste: ${estimatedSupportFilamentGrams}g
Estimated Extra Print Time: ${estimatedExtraPrintTimeMinutes} mins

Summary Advice:
${summaryAdvice}

Recommended Build Orientation:
- Orientation: ${bestOrientation.name}
- Overhang Area: ${bestOrientation.overhangAreaMm2} mm² (Savings: ${bestOrientation.savingsVsCurrent}%)
- Stability Score: ${bestOrientation.stabilityScore}/100

Identified Overhang Regions & Geometric Modifications:
${regions
  .map(
    (r, idx) => `
### ${idx + 1}. ${r.name}
- Type: ${r.type.toUpperCase()}
- Area: ${r.areaMm2} mm² | Elevation: ${r.elevationMm} mm above bed | Overhang Angle: ${r.avgOverhangAngleDeg}°
- Suggested CAD Fix: ${r.suggestedModification.title}
- Technique: ${r.suggestedModification.cadTechnique}
- Parameters:
${r.suggestedModification.cadSteps.map((s) => `  * [${s.tool}] ${s.action} (${s.parameterValue})`).join('\n')}
- Material Note: ${r.suggestedModification.materialSpecificNote}
`
  )
  .join('\n')}

Material Compatibility (${filamentName}):
- Bridging Rating: ${materialConsiderations.bridgingRating}
- Max Recommended Overhang Angle: ${materialConsiderations.recommendedMaxOverhangAngle}°
- Cooling & Sag Advice: ${materialConsiderations.coolingNotes}
`;

    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  // Color coding for score badge
  const getScoreColor = (score: number) => {
    if (score >= 90) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', badge: 'bg-emerald-500' };
    if (score >= 70) return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/40', badge: 'bg-cyan-500' };
    if (score >= 45) return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40', badge: 'bg-amber-500' };
    return { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/40', badge: 'bg-rose-500' };
  };

  const scoreTheme = getScoreColor(feasibilityScore);

  return (
    <div className={`flex flex-col gap-4 text-slate-200 ${className}`}>
      {/* Header Banner: Feasibility Index & Support Savings */}
      <div className={`p-4 rounded-xl border ${scoreTheme.bg} ${scoreTheme.border} relative overflow-hidden backdrop-blur-sm`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-4 border-slate-800 flex items-center justify-center font-mono font-black text-lg bg-slate-950 shadow-inner">
                <span className={scoreTheme.text}>{feasibilityScore}</span>
                <span className="text-[10px] text-slate-500 -mt-2">%</span>
              </div>
              <div
                className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center ${scoreTheme.badge} text-slate-950 font-bold text-[9px] shadow`}
              >
                ★
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>Support-Free DfAM Evaluator</span>
                </h3>
                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${scoreTheme.bg} ${scoreTheme.text} ${scoreTheme.border}`}>
                  {rating}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 max-w-xl">{summaryAdvice}</p>
            </div>
          </div>

          {/* Quick Action: Copy Full Report */}
          <button
            onClick={handleCopyFullReport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors shadow-sm shrink-0"
            title="Copy full DfAM engineering report markdown"
          >
            {copiedReport ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Report Copied</span>
              </>
            ) : (
              <>
                <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                <span>Export DfAM Spec</span>
              </>
            )}
          </button>
        </div>

        {/* Telemetry Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-3 border-t border-slate-800/80">
          <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <Scale className="w-3 h-3 text-cyan-400" />
              <span>OVERHANG AREA</span>
            </div>
            <div className="text-sm font-bold text-slate-100 mt-0.5 font-mono">
              {totalOverhangAreaMm2.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">mm²</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{regions.length} critical clusters</div>
          </div>

          <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <Flame className="w-3 h-3 text-rose-400" />
              <span>SUPPORT WASTE</span>
            </div>
            <div className="text-sm font-bold text-rose-300 mt-0.5 font-mono">
              ~{estimatedSupportFilamentGrams} <span className="text-[10px] text-slate-400 font-normal">grams</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Disposed sacrificial plastic</div>
          </div>

          <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>PRINT TIME PENALTY</span>
            </div>
            <div className="text-sm font-bold text-amber-300 mt-0.5 font-mono">
              +{estimatedExtraPrintTimeMinutes} <span className="text-[10px] text-slate-400 font-normal">mins</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Interface & travel penalty</div>
          </div>

          <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <RotateCw className="w-3 h-3 text-emerald-400" />
              <span>RE-ORIENTATION SAVINGS</span>
            </div>
            <div className="text-sm font-bold text-emerald-300 mt-0.5 font-mono">
              {bestOrientation.savingsVsCurrent}% <span className="text-[10px] text-slate-400 font-normal">reduction</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{bestOrientation.name.split('(')[0]}</div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs overflow-x-auto">
        <button
          onClick={() => setActiveTab('regions')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap ${
            activeTab === 'regions'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Geometric Fixes ({regions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('orientations')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap ${
            activeTab === 'orientations'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          <span>Orientation Alternatives ({orientations.length})</span>
          {bestOrientation.savingsVsCurrent > 20 && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('material')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap ${
            activeTab === 'material'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Material & Cooling ({materialConsiderations.filamentName.split(' ')[0]})</span>
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all whitespace-nowrap ${
            activeTab === 'rules'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>DfAM Cheat Sheet</span>
        </button>
      </div>

      {/* TAB 1: Overhang Regions & Specific Geometric Modifications */}
      {activeTab === 'regions' && (
        <div className="flex flex-col gap-3">
          {/* Quick Filter Bar */}
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="text-slate-400 text-[11px]">Filter by geometric feature:</span>
            <div className="flex items-center gap-1 overflow-x-auto">
              {(
                [
                  { id: 'all', label: 'All Regions' },
                  { id: 'chamfer', label: '45° Chamfers' },
                  { id: 'teardrop_hole', label: 'Teardrop Bores' },
                  { id: 'gusset_rib', label: 'Rib Gussets' },
                  { id: 'sacrificial_bridge', label: 'Sacrificial Bridges' },
                  { id: 'gothic_arch', label: 'Gothic Arches' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterType(f.id)}
                  className={`px-2 py-0.5 text-[10px] rounded-md transition-all whitespace-nowrap ${
                    filterType === f.id
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {regions.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-slate-200">Zero Critical Overhangs Detected!</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                All downward surfaces are within the {overhangThreshold}° threshold. Your model is 100% self-supporting and can be manufactured with zero support structures.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredRegions.map((region, idx) => {
                const isSelected = selectedRegionId === region.id;
                const isExpanded = expandedRegionId === region.id || isSelected;

                const severityBadge =
                  region.severity === 'extreme'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : region.severity === 'critical'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

                return (
                  <div
                    key={region.id}
                    className={`p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/40'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Region Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center font-mono font-bold text-xs text-cyan-300 shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-white">{region.name}</span>
                            <span className={`px-1.5 py-0.2 text-[9px] font-mono uppercase rounded border ${severityBadge}`}>
                              {region.severity}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                            <span>Area: {region.areaMm2} mm²</span>
                            <span>•</span>
                            <span>Elevation: {region.elevationMm} mm above bed</span>
                            <span>•</span>
                            <span>Overhang: {region.avgOverhangAngleDeg}°</span>
                          </div>
                        </div>
                      </div>

                      {/* Top Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {onSelectRegion && (
                          <button
                            onClick={() => onSelectRegion(isSelected ? null : region)}
                            className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg border transition-all ${
                              isSelected
                                ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-semibold'
                                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
                            }`}
                            title="Highlight in 3D Viewport"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{isSelected ? 'Focused' : 'Highlight'}</span>
                          </button>
                        )}

                        <button
                          onClick={() => setExpandedRegionId(isExpanded ? null : region.id)}
                          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Modification Suggestion Card */}
                    <div className="mt-3 p-3 bg-slate-950/80 border border-slate-800/90 rounded-lg flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
                          <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{region.suggestedModification.title}</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                          -{region.suggestedModification.estimatedSavingsPercent}% Support Needed
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {region.suggestedModification.description}
                      </p>

                      {/* CAD Implementation Steps */}
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-col gap-2">
                          <div className="text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
                            CAD Feature Recipe ({region.suggestedModification.cadTechnique})
                          </div>

                          <div className="flex flex-col gap-1.5">
                            {region.suggestedModification.cadSteps.map((step, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-2 bg-slate-900 border border-slate-800 rounded text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                              >
                                <div className="flex items-start gap-1.5">
                                  <span className="text-[10px] font-mono text-cyan-400 font-bold shrink-0 mt-0.5">
                                    Step {sIdx + 1}:
                                  </span>
                                  <div>
                                    <span className="font-medium text-slate-200">[{step.tool}] </span>
                                    <span className="text-slate-400">{step.action}</span>
                                  </div>
                                </div>
                                <div className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-cyan-300 shrink-0 self-start sm:self-auto">
                                  {step.parameterValue}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Material Tip */}
                          <div className="p-2 bg-cyan-950/20 border border-cyan-500/20 rounded text-[11px] text-cyan-300 flex items-start gap-1.5 mt-1">
                            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                            <span>{region.suggestedModification.materialSpecificNote}</span>
                          </div>

                          {/* Copy Recipe Button */}
                          <div className="flex justify-end mt-1">
                            <button
                              onClick={() => handleCopyRecipe(region)}
                              className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded border border-slate-700 transition-colors"
                            >
                              {copiedRegionId === region.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  <span className="text-emerald-400">CAD Recipe Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                                  <span>Copy CAD Feature Recipe</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Alternative Orientations (Build Plate Rotation) */}
      {activeTab === 'orientations' && (
        <div className="flex flex-col gap-3">
          <div className="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl text-xs text-cyan-200 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white">Re-orientation Opportunity: </span>
              Often the fastest and cleanest way to eliminate supports is to rotate the CAD part before altering geometry.
              Review how each build plate rotation impacts total overhang area and bed contact stability below:
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {orientations.map((ori, oIdx) => {
              const isBest = ori === bestOrientation && ori.savingsVsCurrent > 0;
              const isCurrent = ori.degrees === 0 && ori.axis === 'Z';

              return (
                <div
                  key={oIdx}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                    isBest
                      ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30'
                      : isCurrent
                      ? 'bg-slate-900/80 border-cyan-500/30'
                      : 'bg-slate-900/50 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-white">{ori.name}</span>
                        {isCurrent && (
                          <span className="px-1.5 py-0.2 text-[9px] font-mono bg-cyan-500/20 text-cyan-400 rounded border border-cyan-500/30">
                            Current
                          </span>
                        )}
                        {isBest && (
                          <span className="px-1.5 py-0.2 text-[9px] font-mono bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30 font-semibold animate-pulse">
                            Best
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-800/80 text-[11px] font-mono">
                      <div>
                        <span className="text-slate-500 text-[10px]">Overhang Area:</span>
                        <div className="font-semibold text-slate-200">{ori.overhangAreaMm2} mm²</div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px]">Savings vs Current:</span>
                        <div className={`font-semibold ${ori.savingsVsCurrent > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {ori.savingsVsCurrent > 0 ? `-${ori.savingsVsCurrent}%` : 'Baseline'}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px]">Bed Contact Area:</span>
                        <div className="text-slate-300">{ori.bedContactAreaMm2} mm²</div>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px]">Stability Rating:</span>
                        <div
                          className={`font-semibold ${
                            ori.stabilityScore >= 70
                              ? 'text-emerald-400'
                              : ori.stabilityScore >= 45
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {ori.stabilityScore}/100
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Apply Orientation Action Button */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-mono">
                      Euler: [{ori.rotationDegrees.join('°, ')}°]
                    </span>

                    {onApplyOrientation && !isCurrent && (
                      <button
                        onClick={() => onApplyOrientation(ori.axis, ori.degrees)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                          isBest
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold shadow'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Apply to Viewport</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Material & Cooling Considerations */}
      {activeTab === 'material' && (
        <div className="flex flex-col gap-3">
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-cyan-400" />
                <span className="font-semibold text-xs text-white">
                  Active Filament: {materialConsiderations.filamentName}
                </span>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-mono bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                Bridging: {materialConsiderations.bridgingRating}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Max Safe Overhang Angle</span>
                <div className="text-sm font-bold text-slate-100 mt-0.5 font-mono">
                  {materialConsiderations.recommendedMaxOverhangAngle}° from vertical
                </div>
              </div>
              <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[10px] text-slate-500 uppercase font-mono">Bridging Sag Risk</span>
                <div
                  className={`text-sm font-bold mt-0.5 font-mono ${
                    materialConsiderations.sagRisk === 'High'
                      ? 'text-rose-400'
                      : materialConsiderations.sagRisk === 'Medium'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {materialConsiderations.sagRisk}
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-950/80 border border-slate-800/90 rounded-lg text-xs text-slate-300 leading-relaxed">
              <span className="font-semibold text-cyan-300">Cooling & Slicing Recommendations: </span>
              {materialConsiderations.coolingNotes}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DfAM Rules & Quick Cheat Sheet */}
      {activeTab === 'rules' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>1. The 45° Rule of Thumb</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              FDM printers deposit layers horizontally. Any overhang feature steeper than 45° means each layer step overhangs more than 50% of the extrusion bead width, causing droop or spaghetti. Adding a 45° chamfer makes every overhang step fully self-supporting.
            </p>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>2. Teardrop & Diamond Bore Holes</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Horizontal circular holes sag at the apex ceiling. Redesign horizontal tunnels with a 45° pointed roof (teardrop) or rotate the cross section by 45° into a diamond. Standard M-series fasteners seat flush against the bottom half with zero interference.
            </p>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>3. Sacrificial Bridging Membranes</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              For blind counterbore holes or internal captive nut pockets, design a solid 0.20mm (1-layer) membrane across the ceiling. The slicer bridges straight across at high speed with no supports. Push a screwdriver through it post-print in seconds.
            </p>
          </div>

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>4. Triangular Gusset Ribs</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Instead of flat cantilever tabs that require tall support towers from the bed, add 45° triangular web gussets underneath. This eliminates the need for supports while drastically multiplying the load-bearing strength of the part.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
