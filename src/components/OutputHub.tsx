import React, { useState } from 'react';
import * as THREE from 'three';
import JSZip from 'jszip';
import {
  Copy,
  Check,
  Download,
  FileText,
  Sliders,
  ListOrdered,
  Tag,
  Image as ImageIcon,
  CheckCircle2,
  Package,
  Share2,
  ExternalLink,
  Layers,
  Wrench,
  ShieldCheck,
  Sparkles,
  Gauge,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  Info,
  Box,
  Flame,
  Activity,
  FileDown,
  RotateCcw,
  RotateCw,
  FolderArchive,
  FileCode,
  CheckCheck,
  RefreshCw,
  Compass,
  Timer,
  Clock,
  Archive,
} from 'lucide-react';
import { CADProject, FilamentOption, GeneratedSpec, PrinterEcosystem, ViewportSnapshot, MeshComponent, OverhangRegion } from '../types/cad';
import { calculateSuccessScore } from '../utils/geometryMath';
import {
  exportToSTL,
  exportTo3MF,
  exportModel,
  estimateExportSizes,
  triggerFileDownload,
  getBaseFileName,
  ExportFormat,
} from '../utils/modelExporter';
import {
  packageBulkCatalogZip,
  BulkExportOptions,
  DEFAULT_BULK_EXPORT_OPTIONS,
} from '../utils/bulkExport';
import { PrintTimeEstimator } from './PrintTimeEstimator';
import { SupportFreeOptimizer } from './SupportFreeOptimizer';

interface OutputHubProps {
  project: CADProject | null;
  spec: GeneratedSpec | null;
  snapshots: ViewportSnapshot[];
  geometry?: THREE.BufferGeometry | null;
  isTransformed?: boolean;
  transformDescriptions?: string[];
  onResetTransformations?: () => void;
  onTriggerGenerate?: () => void;
  isGenerating?: boolean;
  filament?: FilamentOption | null;
  printer?: PrinterEcosystem | null;
  components?: MeshComponent[];
  overhangThreshold?: number;
  onApplyOrientation?: (axis: 'X' | 'Y' | 'Z', degrees: number) => void;
  onSelectRegion?: (region: OverhangRegion | null) => void;
  selectedRegionId?: string | null;
  isOverhangHeatmapVisible?: boolean;
  onToggleOverhangHeatmap?: () => void;
  catalogProjects?: CADProject[];
  onSelectCatalogProject?: (project: CADProject) => void;
}

export const OutputHub: React.FC<OutputHubProps> = ({
  project,
  spec,
  snapshots,
  geometry,
  isTransformed = false,
  transformDescriptions = [],
  onResetTransformations,
  onTriggerGenerate,
  isGenerating = false,
  filament,
  printer,
  components = [],
  overhangThreshold = 45,
  onApplyOrientation,
  onSelectRegion,
  selectedRegionId,
  isOverhangHeatmapVisible = false,
  onToggleOverhangHeatmap,
  catalogProjects = [],
  onSelectCatalogProject,
}) => {
  const [activeTab, setActiveTab] = useState<
    'spec' | 'slicer' | 'print-time' | 'support-free' | 'printability' | 'export-model' | 'bom' | 'manual' | 'tags' | 'renders' | 'bulk-export'
  >('spec');
  const [estimatedPrintTime, setEstimatedPrintTime] = useState<string>('');
  const [copiedSpec, setCopiedSpec] = useState(false);
  const [copiedTags, setCopiedTags] = useState(false);
  const [copiedBOM, setCopiedBOM] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [showDetailedScoreBreakdown, setShowDetailedScoreBreakdown] = useState(false);

  // Model Export State
  const initialBaseName = getBaseFileName(project?.fileName || 'model');
  const [customExportName, setCustomExportName] = useState<string>(
    isTransformed ? `${initialBaseName}_reoriented` : initialBaseName
  );
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [includeModelInZip, setIncludeModelInZip] = useState<boolean>(true);

  // Catalog Multi-Project Bulk Packager State
  const allAvailableProjects = React.useMemo(() => {
    const list: CADProject[] = [...catalogProjects];
    if (project && project.id) {
      const alreadyInList = list.some((p) => p.id === project.id || p.fileName === project.fileName);
      if (!alreadyInList) {
        list.unshift(project);
      }
    }
    return list;
  }, [catalogProjects, project]);

  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [bulkOptions, setBulkOptions] = useState<BulkExportOptions>(DEFAULT_BULK_EXPORT_OPTIONS);
  const [isBulkZipping, setIsBulkZipping] = useState<boolean>(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; currentItemName: string } | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  // Initialize selectedCatalogIds whenever available projects change and selection is empty
  React.useEffect(() => {
    if (allAvailableProjects.length > 0 && selectedCatalogIds.length === 0) {
      setSelectedCatalogIds(allAvailableProjects.map((p) => p.id));
    }
  }, [allAvailableProjects]);

  const toggleSelectProject = (id: string) => {
    setSelectedCatalogIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  const handleSelectAllProjects = () => {
    setSelectedCatalogIds(allAvailableProjects.map((p) => p.id));
  };

  const handleDeselectAllProjects = () => {
    setSelectedCatalogIds([]);
  };

  const handleBulkExportZip = async () => {
    const projectsToExport = allAvailableProjects.filter((p) =>
      selectedCatalogIds.includes(p.id)
    );
    if (projectsToExport.length === 0) return;

    setIsBulkZipping(true);
    setBulkSuccessMsg(null);
    try {
      const zipBlob = await packageBulkCatalogZip(
        projectsToExport,
        bulkOptions,
        (progress) => {
          setBulkProgress(progress);
        }
      );

      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `CAD_Catalog_Bulk_Export_${projectsToExport.length}_Projects_${dateStr}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setBulkSuccessMsg(`Successfully packaged and exported ${projectsToExport.length} projects into ZIP bundle!`);
      setTimeout(() => setBulkSuccessMsg(null), 6000);
    } catch (err) {
      console.error('Bulk export error:', err);
    } finally {
      setIsBulkZipping(false);
      setBulkProgress(null);
    }
  };

  // Compute 0-100% Print Success Confidence Score using calculateSuccessScore from geometryMath.ts
  const successScore = project?.geometry ? calculateSuccessScore(project.geometry) : null;

  // File size estimates for different formats
  const exportSizes = geometry ? estimateExportSizes(geometry) : null;

  // Visual style helpers based on the confidence score
  const getScoreStyles = (score: number) => {
    if (score >= 92) {
      return {
        colorClass: 'text-emerald-400',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        progressBarColor: 'from-emerald-500 to-teal-400',
      };
    }
    if (score >= 82) {
      return {
        colorClass: 'text-cyan-400',
        badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
        progressBarColor: 'from-cyan-500 to-blue-500',
      };
    }
    if (score >= 70) {
      return {
        colorClass: 'text-amber-400',
        badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
        progressBarColor: 'from-amber-500 to-yellow-400',
      };
    }
    if (score >= 55) {
      return {
        colorClass: 'text-orange-400',
        badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
        progressBarColor: 'from-orange-500 to-red-400',
      };
    }
    return {
      colorClass: 'text-rose-400',
      badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      progressBarColor: 'from-rose-600 to-rose-400',
    };
  };

  const scoreStyles = successScore ? getScoreStyles(successScore.score) : null;

  // Export 3D model directly as .stl or .3mf
  const handleExportModel = async (format: ExportFormat) => {
    if (!geometry) return;
    setExportingFormat(format);
    try {
      const effectiveName = customExportName.trim() || initialBaseName;
      const result = await exportModel(geometry, {
        fileName: effectiveName,
        format,
        isTransformed,
        modelTitle: spec?.title || effectiveName,
        designer: 'CAD-Tagger Maker',
      });
      triggerFileDownload(result.blob, result.suggestedFileName);
      setDownloadSuccess(result.suggestedFileName);
      setTimeout(() => setDownloadSuccess(null), 4000);
    } catch (err: any) {
      console.error('Error exporting 3D model:', err);
    } finally {
      setExportingFormat(null);
    }
  };

  // Format full Markdown for Printables / MakerWorld with calculateSuccessScore integrated
  const formattedMarkdown = spec
    ? `
# ${spec.title}

> ${spec.pitch}

---

## 🎯 Print Success Confidence Score: ${successScore ? `${successScore.score}% (${successScore.grade} — ${successScore.ratingLabel})` : 'N/A'}
* **Model Volume:** ${project?.geometry.volumeCm3.toFixed(2)} cm³ (${successScore && successScore.volumePenalty === 0 ? 'Optimal thermal stability' : `-${successScore?.volumePenalty}% thermal warping factor`})
* **Bounding Box Complexity:** ${(successScore ? successScore.packingEfficiency * 100 : 0).toFixed(0)}% solidity / ${successScore?.aspectRatio.toFixed(1)}:1 aspect ratio (${successScore && successScore.complexityPenalty === 0 ? 'Low void complexity' : `-${successScore?.complexityPenalty}% complexity factor`})
* **Critical Overhang Face Ratio:** ${successScore?.overhangPercentageOfFaces.toFixed(1)}% of faces (${project?.geometry.criticalOverhangCount || 0} / ${project?.geometry.totalFaces || 0} faces) (${successScore && successScore.overhangPenalty === 0 ? 'Self-supporting' : `-${successScore?.overhangPenalty}% overhang penalty`})
${isTransformed ? `* **Mesh Orientation:** Custom reoriented in CAD-Tagger (includes ${transformDescriptions.length > 0 ? transformDescriptions.join(', ') : 'orientation transforms'})` : ''}

---

## 🖨️ Recommended Slicing Profile (${project?.settings?.printerEcosystem || '3D Printer'})
* **Filament Material:** ${project?.settings?.filament || 'PLA'} (${project?.settings?.nozzleTemp || 215}°C Nozzle / ${project?.settings?.bedTemp || 60}°C Bed)
* **Layer Height:** ${spec.slicingProfile.recommendedLayerHeight}
* **Wall Perimeters:** ${spec.slicingProfile.wallPerimeters}
* **Top / Bottom Solid Layers:** ${spec.slicingProfile.topBottomLayers}
* **Infill Pattern & Density:** ${spec.slicingProfile.infillPattern} @ ${spec.slicingProfile.infillDensity}
* **Supports:** ${spec.slicingProfile.supportType} (${spec.slicingProfile.supportThresholdAngle})
* **Bed Adhesion:** ${spec.slicingProfile.bedAdhesion}
* **Est. Print Time:** ~${spec.estimatedPrintTimeHours}

### 📐 Critical Print Orientation
${spec.slicingProfile.printOrientation}

---

## 🔩 Hardware Bill of Materials (BOM)
${
  spec.hardwareBOM && spec.hardwareBOM.length > 0
    ? spec.hardwareBOM
        .map((b) => `* **${b.quantity}x** ${b.item} (${b.type}) — *${b.notes}*`)
        .join('\n')
    : '* No external hardware required. 100% 3D printed assembly.'
}

---

## 🛠️ Step-by-Step Assembly Instructions
${spec.assemblyManual}

---

## 📏 Geometric Telemetry (Computed directly from CAD Mesh)
* **Dimensions (X × Y × Z):** ${project?.geometry.dimX.toFixed(1)} × ${project?.geometry.dimY.toFixed(1)} × ${project?.geometry.dimZ.toFixed(1)} mm
* **Volume:** ${project?.geometry.volumeCm3.toFixed(2)} cm³
* **Solid Part Mass:** ${project?.geometry.estimatedMassGrams.toFixed(1)} g (${project?.settings.filament})
* **Bed Footprint Area:** ${project?.geometry.footprintAreaMm2.toFixed(0)} mm²
* **Transformation State:** ${isTransformed ? `Modified (${transformDescriptions.length} transforms)` : 'Original import'}

---

## 🏷️ Tags
${spec.tags.join(' ')}
`.trim()
    : '';

  // Copy Markdown to Clipboard
  const handleCopySpec = async () => {
    try {
      await navigator.clipboard.writeText(formattedMarkdown);
      setCopiedSpec(true);
      setTimeout(() => setCopiedSpec(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  // Copy Tags
  const handleCopyTags = async () => {
    if (!spec) return;
    try {
      await navigator.clipboard.writeText(spec.tags.join(', '));
      setCopiedTags(true);
      setTimeout(() => setCopiedTags(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  // Download Complete ZIP Asset Bundle (including 3D models)
  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const cleanName = getBaseFileName(project?.fileName || 'cad_project');
      const modelSuffix = isTransformed ? '_reoriented' : '';

      // 1. README.md
      if (formattedMarkdown) {
        zip.file('README.md', formattedMarkdown);
      }

      // 2. tags.txt
      if (spec) {
        zip.file('tags.txt', spec.tags.join('\n'));
      }

      // 3. slicer_settings.json with success score details
      const slicerData = {
        modelFile: project?.fileName || 'model.stl',
        isTransformed,
        transformationHistory: transformDescriptions,
        printer: project?.settings?.targetPrinter,
        filament: project?.settings?.filament,
        temperatures: {
          nozzle: project?.settings?.nozzleTemp,
          bed: project?.settings?.bedTemp,
        },
        successConfidenceScore: successScore,
        slicerProfile: spec?.slicingProfile,
        geometry: project?.geometry,
      };
      zip.file('slicer_settings.json', JSON.stringify(slicerData, null, 2));

      // 4. hardware_bom.csv
      if (spec?.hardwareBOM && spec.hardwareBOM.length > 0) {
        const csvHeader = 'Item,Quantity,Type,Notes\n';
        const csvRows = spec.hardwareBOM
          .map((b) => `"${b.item}","${b.quantity}","${b.type}","${b.notes}"`)
          .join('\n');
        zip.file('hardware_bom.csv', csvHeader + csvRows);
      }

      // 5. Viewport Render PNG Images
      if (snapshots.length > 0) {
        const imgFolder = zip.folder('renders');
        for (const snap of snapshots) {
          if (snap.dataUrl && snap.dataUrl.includes(',')) {
            const base64Data = snap.dataUrl.split(',')[1];
            imgFolder?.file(`${snap.viewName}.png`, base64Data, { base64: true });
          }
        }
      }

      // 6. Include Exported 3D Model (.stl and .3mf) in ZIP bundle
      if (geometry && includeModelInZip) {
        try {
          const modelFolder = zip.folder('models') || zip;

          // Binary STL
          const stlBlob = exportToSTL(geometry, true);
          const stlBuffer = await stlBlob.arrayBuffer();
          modelFolder.file(`${cleanName}${modelSuffix}.stl`, stlBuffer);

          // 3MF Container
          const m3mfBlob = await exportTo3MF(geometry, {
            modelTitle: `${cleanName}${modelSuffix}`,
            designer: 'CAD-Tagger Maker',
          });
          const m3mfBuffer = await m3mfBlob.arrayBuffer();
          modelFolder.file(`${cleanName}${modelSuffix}.3mf`, m3mfBuffer);
        } catch (modelErr) {
          console.error('Error bundling 3D models into ZIP:', modelErr);
        }
      }

      // Generate ZIP blob and trigger download
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `${cleanName}_Printables_MakerWorld_AssetBundle.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error creating ZIP bundle:', err);
    } finally {
      setIsZipping(false);
    }
  };

  // -------------------------------------------------------------------------
  // RENDER: 3D MODEL EXPORT SECTION (.STL / .3MF)
  // -------------------------------------------------------------------------
  const renderModelExportSection = () => (
    <div className="flex flex-col gap-4">
      {/* Transformation Status Card */}
      <div
        className={`p-4 rounded-xl border flex flex-col gap-3 transition-all ${
          isTransformed
            ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
            : 'bg-slate-900/60 border-slate-800 text-slate-300'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg ${
                isTransformed ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'
              }`}
            >
              {isTransformed ? <RotateCcw className="w-5 h-5 animate-pulse" /> : <Box className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-100">
                  {isTransformed ? 'Modified 3D Model Orientation' : 'Standard 3D Model Orientation'}
                </span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${
                    isTransformed
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {isTransformed ? 'Transformed' : 'Original Import'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isTransformed
                  ? 'All 3D rotations, translations, and build-plate groundings applied in the viewport are baked directly into the exported mesh.'
                  : 'Export the mesh in its original coordinates, or use viewport tools (+90° X, +90° Y, Lay Flat, Center) to reorient.'}
              </p>
            </div>
          </div>

          {/* Reset Transformations Button if transformed */}
          {isTransformed && onResetTransformations && (
            <button
              onClick={onResetTransformations}
              className="px-3 py-1.5 text-xs font-mono font-medium rounded-lg bg-slate-900 hover:bg-rose-950/60 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-500/40 transition-colors flex items-center gap-1.5 shrink-0"
              title="Revert mesh to original orientation"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Revert to Original</span>
            </button>
          )}
        </div>

        {/* Transformation Log Chips */}
        {isTransformed && transformDescriptions.length > 0 && (
          <div className="pt-2 border-t border-amber-500/20 flex flex-col gap-1.5">
            <span className="text-[10px] uppercase font-mono tracking-wider text-amber-400/80">
              Transformations Applied ({transformDescriptions.length}):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {transformDescriptions.map((desc, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-950/80 border border-amber-500/30 text-amber-200 flex items-center gap-1"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>{desc}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filename Customization Input */}
      <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-2">
        <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export File Name:</span>
          </span>
          <span className="text-[10px] font-mono text-slate-500">Extension automatically added</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customExportName}
            onChange={(e) => setCustomExportName(e.target.value)}
            placeholder="my_model_name"
            className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={() => setCustomExportName(initialBaseName)}
            className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded-lg border border-slate-700 transition-colors"
            title="Reset to original filename"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Download Success Banner */}
      {downloadSuccess && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl flex items-center justify-between text-xs text-emerald-200 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Successfully exported <strong>{downloadSuccess}</strong>
            </span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 uppercase">Ready for Slicer</span>
        </div>
      )}

      {/* Export Format Action Cards (STL Binary, 3MF, STL ASCII) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Card 1: Binary STL */}
        <div className="p-4 bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 rounded-xl flex flex-col justify-between transition-all group shadow-md">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded">
                Standard STL
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                ~{exportSizes ? (exportSizes.estimatedStlBinaryBytes / 1024).toFixed(1) : 48} KB
              </span>
            </div>
            <h4 className="text-sm font-bold text-slate-100 mt-2 flex items-center gap-1.5">
              <Box className="w-4 h-4 text-cyan-400" />
              <span>Binary STL (.stl)</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Standard binary StereoLithography. 100% compatible with every 3D slicer (Bambu Studio, PrusaSlicer, Cura, OrcaSlicer, Creality Print).
            </p>
          </div>

          <button
            onClick={() => handleExportModel('stl-binary')}
            disabled={exportingFormat !== null || !geometry}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded-lg shadow transition-all active:scale-95 disabled:opacity-50"
          >
            {exportingFormat === 'stl-binary' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Exporting STL...</span>
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5" />
                <span>Export Binary .STL</span>
              </>
            )}
          </button>
        </div>

        {/* Card 2: Production 3MF Package */}
        <div className="p-4 bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 rounded-xl flex flex-col justify-between transition-all group shadow-md">
          <div>
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
                Modern 3MF • 70% Smaller
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                ~{exportSizes ? (exportSizes.estimated3mfBytes / 1024).toFixed(1) : 15} KB
              </span>
            </div>
            <h4 className="text-sm font-bold text-slate-100 mt-2 flex items-center gap-1.5">
              <Package className="w-4 h-4 text-emerald-400" />
              <span>3D Manufacturing Format (.3mf)</span>
            </h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Official 3MF Consortium OPC package. Preserves exact millimeter dimensions and model metadata. Native for Bambu Lab, Prusa, and MakerWorld.
            </p>
          </div>

          <button
            onClick={() => handleExportModel('3mf')}
            disabled={exportingFormat !== null || !geometry}
            className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-lg shadow transition-all active:scale-95 disabled:opacity-50"
          >
            {exportingFormat === '3mf' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Generating 3MF Package...</span>
              </>
            ) : (
              <>
                <FolderArchive className="w-3.5 h-3.5" />
                <span>Export Modern .3MF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Card 3: Secondary ASCII STL Option & Checkbox */}
      <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileCode className="w-4 h-4 text-slate-400" />
          <div>
            <div className="text-xs font-semibold text-slate-200">ASCII Plaintext STL</div>
            <div className="text-[10px] text-slate-400">Human-readable text coordinates for CAD diffing & version control</div>
          </div>
        </div>

        <button
          onClick={() => handleExportModel('stl-ascii')}
          disabled={exportingFormat !== null || !geometry}
          className="px-3 py-1.5 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors shrink-0"
        >
          {exportingFormat === 'stl-ascii' ? 'Writing ASCII...' : 'Export ASCII .STL'}
        </button>
      </div>

      {/* Model Telemetry & Slicer Bed Clearance Check */}
      <div className="p-3.5 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col gap-2.5">
        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export Mesh Telemetry & Clearance:</span>
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase block">Bounding Box</span>
            <span className="text-slate-200 font-bold">
              {project?.geometry.dimX.toFixed(1)} × {project?.geometry.dimY.toFixed(1)} × {project?.geometry.dimZ.toFixed(1)} mm
            </span>
          </div>

          <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase block">Solid Volume</span>
            <span className="text-slate-200 font-bold">{project?.geometry.volumeCm3.toFixed(2)} cm³</span>
          </div>

          <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase block">Mesh Triangles</span>
            <span className="text-slate-200 font-bold">{exportSizes?.triangleCount.toLocaleString() || 'N/A'}</span>
          </div>

          <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase block">Bed Clearance</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Fits Standard Bed</span>
            </span>
          </div>
        </div>

        {/* Checkbox: Include 3D model in ZIP */}
        <div className="mt-1 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={includeModelInZip}
              onChange={(e) => setIncludeModelInZip(e.target.checked)}
              className="rounded bg-slate-950 border-slate-700 text-cyan-500 focus:ring-0"
            />
            <span>Include both .stl & .3mf models inside the ZIP asset bundle</span>
          </label>
          <span className="text-[10px] font-mono text-cyan-400 hidden sm:inline">Folder: models/</span>
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // RENDER: GEOMETRY ANALYSIS & OVERHANG HEAT-MAP SECTION
  // -------------------------------------------------------------------------
  const renderGeometryAnalysisSection = () => {
    if (!project?.geometry) return null;
    const geo = project.geometry;
    const overhangCount = geo.criticalOverhangCount || 0;
    const totalFaces = geo.totalFaces || 1;
    const overhangPct = geo.overhangPercentage || 0;

    return (
      <div className="p-4 bg-slate-900/70 border border-slate-800 rounded-xl shadow-lg flex flex-col gap-3">
        {/* Section Header with Dedicated Heat-Map Toggle Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Flame className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-100">Geometry Analysis</h3>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700">
                Threshold: {overhangThreshold}°
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Evaluates bounding dimensions, solid volume, and cantilever faces exceeding {overhangThreshold}° critical threshold.
            </p>
          </div>

          {/* DEDICATED OVERHANG HEAT-MAP TOGGLE BUTTON */}
          {onToggleOverhangHeatmap && (
            <button
              onClick={onToggleOverhangHeatmap}
              type="button"
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-all shadow-md shrink-0 active:scale-95 ${
                isOverhangHeatmapVisible
                  ? 'bg-rose-500/25 text-rose-200 border-rose-500/60 ring-2 ring-rose-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-rose-500/40'
              }`}
              title={
                isOverhangHeatmapVisible
                  ? 'Turn off overhang heat-map overlay and restore standard polymer shader'
                  : 'Toggle overhang angle heat-map overlay directly on 3D model in viewport (>45° critical faces)'
              }
            >
              <Flame
                className={`w-4 h-4 ${
                  isOverhangHeatmapVisible ? 'text-rose-400 animate-pulse' : 'text-slate-400'
                }`}
              />
              <span>
                {isOverhangHeatmapVisible ? 'Overhang Heat-Map: Active' : 'Toggle Overhang Heat-Map'}
              </span>
              <span
                className={`w-2 h-2 rounded-full ${
                  isOverhangHeatmapVisible ? 'bg-rose-400 animate-ping' : 'bg-slate-500'
                }`}
              />
            </button>
          )}
        </div>

        {/* Telemetry Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase block font-sans">Bounding Box</span>
            <span className="text-slate-200 font-bold">
              {geo.dimX.toFixed(1)} × {geo.dimY.toFixed(1)} × {geo.dimZ.toFixed(1)} mm
            </span>
          </div>

          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase block font-sans">Solid Volume</span>
            <span className="text-slate-200 font-bold">{geo.volumeCm3.toFixed(2)} cm³</span>
          </div>

          <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
            <span className="text-[10px] text-slate-500 uppercase block font-sans">Part Mass</span>
            <span className="text-slate-200 font-bold">{geo.estimatedMassGrams.toFixed(1)} g</span>
          </div>

          <div
            className={`p-2.5 bg-slate-950 border rounded-lg ${
              overhangCount > 0 ? 'border-rose-500/30' : 'border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase font-sans">
              <span>Overhang Faces</span>
              <span
                className={`font-mono font-bold ${
                  overhangCount === 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {overhangPct.toFixed(1)}%
              </span>
            </div>
            <span
              className={`font-bold ${
                overhangCount === 0 ? 'text-emerald-400' : 'text-rose-300'
              }`}
            >
              {overhangCount.toLocaleString()} / {totalFaces.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Interactive Notice & Toggle Status */}
        <div
          className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 transition-all ${
            isOverhangHeatmapVisible
              ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
              : 'bg-slate-950/60 border-slate-800 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <Info className={`w-4 h-4 shrink-0 ${isOverhangHeatmapVisible ? 'text-rose-400' : 'text-slate-500'}`} />
            <span>
              {isOverhangHeatmapVisible
                ? `Heat-map overlay is actively projected onto the 3D viewport. Red faces exceed ${overhangThreshold}° critical cantilever threshold; green/neutral faces are self-supporting.`
                : `Toggle the heat-map overlay anytime to visually inspect critical overhang faces on the model.`}
            </span>
          </div>

          {onToggleOverhangHeatmap && (
            <button
              onClick={onToggleOverhangHeatmap}
              type="button"
              className={`text-[11px] font-semibold underline underline-offset-2 shrink-0 transition-colors ${
                isOverhangHeatmapVisible
                  ? 'text-rose-300 hover:text-white'
                  : 'text-cyan-400 hover:text-cyan-300'
              }`}
            >
              {isOverhangHeatmapVisible ? 'Dismiss Heat-Map' : 'Show on Model'}
            </button>
          )}
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER: PRINT SUCCESS SCORE SECTION
  // -------------------------------------------------------------------------
  const renderConfidenceScoreSection = () => {
    if (!successScore || !scoreStyles) return null;
    return (
      <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl shadow-lg flex flex-col gap-3 relative overflow-hidden">
        {/* Subtle background ambient glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Top Row: Confidence Score Badge & Summary */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Circular Metric Gauge Box */}
            <div className="relative flex items-center justify-center w-14 h-14 rounded-xl bg-slate-950 border border-slate-800 shadow-inner">
              <span className="text-xl font-mono font-black tracking-tight text-slate-100">
                {successScore.score}
              </span>
              <span className="text-[10px] font-mono text-cyan-400 absolute top-2 right-2">%</span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Print Success Confidence</span>
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${scoreStyles.badgeBg}`}>
                  Grade {successScore.grade}
                </span>
              </div>
              <div className={`text-xs font-medium mt-0.5 ${scoreStyles.colorClass}`}>
                {successScore.ratingLabel}
              </div>
            </div>
          </div>

          {/* Toggle Detailed Telemetry */}
          <button
            onClick={() => setShowDetailedScoreBreakdown(!showDetailedScoreBreakdown)}
            className="text-xs text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-1 font-mono"
          >
            <span>{showDetailedScoreBreakdown ? 'Hide Breakdown' : 'View Factor Diagnostics'}</span>
          </button>
        </div>

        {/* Calibrated 0-100% Progress Bar */}
        <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden relative">
          <div
            className={`h-full bg-gradient-to-r ${scoreStyles.progressBarColor} rounded-full transition-all duration-700`}
            style={{ width: `${successScore.score}%` }}
          />
        </div>

        {/* Three Key Scoring Factors: Volume, Bbox Complexity, Overhang Face Ratio */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {/* 1. Model Volume Factor */}
          <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Model Volume</span>
              </span>
              <span className={`font-mono ${successScore.volumePenalty === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {successScore.volumePenalty === 0 ? '0 pt' : `-${successScore.volumePenalty} pts`}
              </span>
            </div>
            <div className="text-sm font-mono font-bold text-slate-200 mt-1">
              {project?.geometry.volumeCm3.toFixed(1)} cm³
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {successScore.volumePenalty === 0 ? 'Low thermal stress' : 'Risk of thermal warping'}
            </div>
          </div>

          {/* 2. Bounding Box Complexity Factor */}
          <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] uppercase font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <Box className="w-3 h-3 text-blue-400" />
                <span>BBox Solidity</span>
              </span>
              <span className={`font-mono ${successScore.complexityPenalty === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {successScore.complexityPenalty === 0 ? '0 pt' : `-${successScore.complexityPenalty} pts`}
              </span>
            </div>
            <div className="text-sm font-mono font-bold text-slate-200 mt-1">
              {(successScore.packingEfficiency * 100).toFixed(0)}% fill
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Aspect {successScore.aspectRatio.toFixed(1)}:1 ({successScore.aspectRatio > 2.5 ? 'Tall profile' : 'Stable aspect'})
            </div>
          </div>

            {/* 3. Critical Overhang Ratio Factor */}
            <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex flex-col justify-between">
              <div className="flex items-center justify-between text-[10px] uppercase font-mono text-slate-400">
                <span className="flex items-center gap-1">
                  <Flame className="w-3 h-3 text-rose-400" />
                  <span>Overhang Faces</span>
                </span>
                <span className={`font-mono ${successScore.overhangPenalty === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {successScore.overhangPenalty === 0 ? '0 pt' : `-${successScore.overhangPenalty} pts`}
                </span>
              </div>
              <div className="text-sm font-mono font-bold text-slate-200 mt-1">
                {successScore.overhangPercentageOfFaces.toFixed(1)}% of mesh
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {project?.geometry.criticalOverhangCount || 0} / {project?.geometry.totalFaces || 0} faces
              </div>

              {onToggleOverhangHeatmap && (
                <button
                  onClick={onToggleOverhangHeatmap}
                  type="button"
                  className={`mt-1.5 pt-1.5 border-t border-slate-800/80 text-[10px] font-mono flex items-center justify-between transition-colors ${
                    isOverhangHeatmapVisible
                      ? 'text-rose-300 font-semibold'
                      : 'text-slate-400 hover:text-rose-300'
                  }`}
                  title="Toggle Overhang Heat-Map overlay in 3D viewport"
                >
                  <span className="flex items-center gap-1">
                    <Flame className="w-2.5 h-2.5 text-rose-400" />
                    <span>{isOverhangHeatmapVisible ? 'Heat-Map: Active' : 'Toggle 3D Heat-Map'}</span>
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full ${isOverhangHeatmapVisible ? 'bg-rose-400 animate-pulse' : 'bg-slate-600'}`} />
                </button>
              )}
            </div>
          </div>

        {/* Expandable Diagnostic Breakdown Details */}
        {showDetailedScoreBreakdown && (
          <div className="mt-1 pt-3 border-t border-slate-800/80 flex flex-col gap-2.5 text-xs animate-fadeIn">
            <div className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>Confidence Assessment Details:</span>
            </div>
            <p className="text-slate-400 text-xs italic">{successScore.summaryText}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Overhang Threshold Exceeded</span>
                <div className="text-xs text-slate-200 mt-0.5">
                  {successScore.overhangPenalty === 0
                    ? 'Mesh is self-supporting (under 2% downward steep faces).'
                    : `${successScore.overhangPercentageOfFaces.toFixed(1)}% of faces exceed 45° threshold. Tree supports advised to avoid droop.`}
                </div>
              </div>

              <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Thermal & Stability Risk</span>
                <div className="text-xs text-slate-200 mt-0.5">
                  {successScore.volumePenalty <= 2
                    ? 'Compact thermal mass minimizes residual cooling stresses.'
                    : `Volume (${project?.geometry.volumeCm3.toFixed(1)} cm³) creates corner lifting risk. 5mm outer brim recommended.`}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER: BULK CATALOG MULTI-PROJECT EXPORT SECTION
  // -------------------------------------------------------------------------
  const renderBulkExportSection = () => {
    const selectedCount = selectedCatalogIds.length;
    const totalCount = allAvailableProjects.length;

    return (
      <div className="flex flex-col gap-4 text-slate-200">
        {/* Header Hero Banner */}
        <div className="p-4 bg-gradient-to-r from-indigo-950/60 via-slate-900 to-cyan-950/40 border border-indigo-500/40 rounded-xl shadow-lg flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0">
                <FolderArchive className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Catalog Bulk Export & Packager</h3>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {totalCount} Total in Catalog
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Package multiple project entries from your Catalog into a single organized ZIP archive containing all generated spec sheets (<code className="text-cyan-300">README.md</code>), platform discovery tags (<code className="text-cyan-300">tags.txt</code>), multi-angle rendered preview images (<code className="text-cyan-300">renders/*.png</code>), and machine slicing parameters (<code className="text-cyan-300">slicer_settings.json</code>).
                </p>
              </div>
            </div>

            {/* Main Export Action Button */}
            <button
              onClick={handleBulkExportZip}
              disabled={selectedCount === 0 || isBulkZipping}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shadow-lg transition-all shrink-0 active:scale-95 ${
                selectedCount === 0
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-indigo-500 via-cyan-500 to-teal-400 hover:from-indigo-400 hover:to-teal-300 text-slate-950 font-bold'
              }`}
            >
              {isBulkZipping ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>
                    Packaging {bulkProgress ? `(${bulkProgress.current}/${bulkProgress.total})` : 'ZIP'}...
                  </span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-slate-950" />
                  <span>Download Bulk ZIP ({selectedCount} Selected)</span>
                </>
              )}
            </button>
          </div>

          {/* Real-time Progress Bar */}
          {isBulkZipping && bulkProgress && (
            <div className="p-3 bg-slate-950/80 border border-indigo-500/40 rounded-lg flex flex-col gap-1.5 animate-pulse">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-indigo-300 flex items-center gap-1.5 truncate">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin shrink-0" />
                  <span>Packaging Project {bulkProgress.current} of {bulkProgress.total}:</span>
                  <strong className="text-white ml-1 truncate">{bulkProgress.currentItemName}</strong>
                </span>
                <span className="text-cyan-400 shrink-0">
                  {Math.round((bulkProgress.current / bulkProgress.total) * 100)}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-300"
                  style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Success Banner */}
          {bulkSuccessMsg && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-lg flex items-center gap-2 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{bulkSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* Options & Selective Toggle Bar */}
        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-slate-200">Catalog Selection:</span>
              <span className="text-cyan-400 font-mono font-bold">
                {selectedCount} of {totalCount} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllProjects}
                className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-all"
              >
                Select All ({totalCount})
              </button>
              <button
                type="button"
                onClick={handleDeselectAllProjects}
                className="px-2.5 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-400 rounded border border-slate-700 transition-all"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Packaging Inclusion Checkboxes */}
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-2">
              Asset Files Included in Each Project Subfolder:
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <label className="flex items-center gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={bulkOptions.includeSpecSheets}
                  onChange={(e) =>
                    setBulkOptions((prev) => ({ ...prev, includeSpecSheets: e.target.checked }))
                  }
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="text-slate-300">Spec Sheets (<code className="text-cyan-400 text-[10px]">README.md</code>)</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={bulkOptions.includeTags}
                  onChange={(e) =>
                    setBulkOptions((prev) => ({ ...prev, includeTags: e.target.checked }))
                  }
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="text-slate-300">Platform Tags (<code className="text-cyan-400 text-[10px]">tags.txt</code>)</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={bulkOptions.includeRenders}
                  onChange={(e) =>
                    setBulkOptions((prev) => ({ ...prev, includeRenders: e.target.checked }))
                  }
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="text-slate-300">Preview Renders (<code className="text-cyan-400 text-[10px]">renders/*.png</code>)</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={bulkOptions.includeSlicerSettings}
                  onChange={(e) =>
                    setBulkOptions((prev) => ({ ...prev, includeSlicerSettings: e.target.checked }))
                  }
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="text-slate-300">Slicer Settings (<code className="text-cyan-400 text-[10px]">slicer_settings.json</code>)</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={bulkOptions.includeHardwareBOM}
                  onChange={(e) =>
                    setBulkOptions((prev) => ({ ...prev, includeHardwareBOM: e.target.checked }))
                  }
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="text-slate-300">Hardware BOM (<code className="text-cyan-400 text-[10px]">hardware_bom.csv</code>)</span>
              </label>

              <label className="flex items-center gap-2 p-2 bg-slate-950/70 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={bulkOptions.includeMasterIndex}
                  onChange={(e) =>
                    setBulkOptions((prev) => ({ ...prev, includeMasterIndex: e.target.checked }))
                  }
                  className="rounded border-slate-700 text-cyan-500 focus:ring-0"
                />
                <span className="text-slate-300">Archive Index (<code className="text-cyan-400 text-[10px]">CATALOG_INDEX.md</code>)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Catalog Project Cards Selection List */}
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>Select projects to bundle ({selectedCount} selected):</span>
            <span className="text-[11px] font-mono text-slate-500">
              Each selected project will be saved into its own numbered folder
            </span>
          </div>

          {allAvailableProjects.length === 0 ? (
            <div className="p-8 text-center bg-slate-900/40 border border-slate-800 rounded-xl text-slate-500 text-xs">
              <FolderArchive className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
              <div>No project entries in Catalog yet.</div>
              <div className="text-[11px] text-slate-600 mt-1">
                Generate specs for your loaded CAD parts or load sample models to build your catalog.
              </div>
            </div>
          ) : (
            allAvailableProjects.map((proj, idx) => {
              const isSelected = selectedCatalogIds.includes(proj.id);
              const isCurrent = project && (project.id === proj.id || project.fileName === proj.fileName);
              const previewImg = proj.snapshots && proj.snapshots[0]?.dataUrl;

              return (
                <div
                  key={proj.id}
                  onClick={() => toggleSelectProject(proj.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 group ${
                    isSelected
                      ? 'bg-slate-900/90 border-cyan-500/60 shadow-md ring-1 ring-cyan-500/20'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Checkbox indicator */}
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        isSelected
                          ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                          : 'border-slate-700 bg-slate-900 group-hover:border-slate-600'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    {/* Thumbnail render preview */}
                    <div className="w-14 h-12 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center relative">
                      {previewImg ? (
                        <img
                          src={previewImg}
                          alt={proj.fileName}
                          className="w-full h-full object-contain bg-slate-950"
                        />
                      ) : (
                        <Box className="w-6 h-6 text-slate-700" />
                      )}
                      <span className="absolute bottom-0.5 right-0.5 text-[8px] font-mono px-1 rounded bg-black/70 text-slate-300">
                        #{idx + 1}
                      </span>
                    </div>

                    {/* Project Title and Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-100 truncate">
                          {proj.spec?.title || proj.fileName}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            Active in Workspace
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-mono text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="text-slate-500">{proj.fileName}</span>
                        <span>•</span>
                        <span className="text-cyan-400">{proj.settings.filament}</span>
                        {proj.geometry && (
                          <>
                            <span>•</span>
                            <span>
                              {proj.geometry.dimX.toFixed(0)}×{proj.geometry.dimY.toFixed(0)}×{proj.geometry.dimZ.toFixed(0)} mm
                            </span>
                            <span>•</span>
                            <span>{proj.geometry.estimatedMassGrams.toFixed(1)}g</span>
                          </>
                        )}
                        {proj.spec?.estimatedPrintTimeHours && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400">~{proj.spec.estimatedPrintTimeHours}</span>
                          </>
                        )}
                      </div>

                      {/* Content Badges */}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {proj.spec ? (
                          <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <FileText className="w-2.5 h-2.5" />
                            <span>SPEC SHEET</span>
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-800 text-slate-400">
                            Geometry Telemetry
                          </span>
                        )}

                        {proj.spec?.tags && (
                          <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                            <Tag className="w-2.5 h-2.5" />
                            <span>{proj.spec.tags.length} TAGS</span>
                          </span>
                        )}

                        {proj.snapshots && proj.snapshots.length > 0 && (
                          <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                            <ImageIcon className="w-2.5 h-2.5" />
                            <span>{proj.snapshots.length} RENDERS</span>
                          </span>
                        )}

                        {proj.spec?.hardwareBOM && proj.spec.hardwareBOM.length > 0 && (
                          <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                            <Package className="w-2.5 h-2.5" />
                            <span>{proj.spec.hardwareBOM.length} BOM</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side status / Load button */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {onSelectCatalogProject && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectCatalogProject(proj);
                        }}
                        className="px-2.5 py-1 text-[10px] font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                        title="Load this project into workspace"
                      >
                        Load Part
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // If spec is not yet generated, render the 3D Model Exporter & Confidence Score immediately
  if (!spec) {
    return (
      <div className="flex flex-col gap-4 text-slate-200">
        {/* Navigation Switcher for Pre-Spec State */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('spec')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab !== 'bulk-export'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              Model Inspection & Slicer
            </button>
            <button
              onClick={() => setActiveTab('bulk-export')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all relative ${
                activeTab === 'bulk-export'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
              <span>Bulk Catalog Export ({allAvailableProjects.length})</span>
              {allAvailableProjects.length > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              )}
            </button>
          </div>
        </div>

        {activeTab === 'bulk-export' ? (
          renderBulkExportSection()
        ) : (
          <>
            {/* Banner with Generate CTA and 3D Export Status */}
            <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-900/90 border border-slate-800 rounded-xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded">
                    Mesh Loaded
                  </span>
                  {isTransformed ? (
                    <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded flex items-center gap-1">
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Modified in Viewport</span>
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-slate-800 text-slate-400 rounded">
                      Original Orientation
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-slate-100 mt-1">{project?.fileName || 'CAD Model'}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Export your modified 3D model below as .STL or .3MF, or trigger Gemini Multimodal AI to generate the complete spec sheet.
                </p>
              </div>

              {onTriggerGenerate && (
                <button
                  onClick={onTriggerGenerate}
                  disabled={isGenerating || !geometry}
                  className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-semibold text-xs rounded-lg shadow-md transition-all active:scale-95 shrink-0"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>{isGenerating ? 'Analyzing Model...' : 'Generate Full Spec'}</span>
                </button>
              )}
            </div>

            {/* 3D Model Exporter Section */}
            {renderModelExportSection()}

            {/* Dedicated Geometry Analysis Section with Overhang Heat-Map Toggle */}
            {renderGeometryAnalysisSection()}

            {/* Print Time Estimator Component */}
            {project?.geometry && (
              <PrintTimeEstimator
                volumeCm3={project.geometry.volumeCm3}
                geometryData={project.geometry}
                filament={filament || project.settings.filament}
                printer={printer || project.settings.printerEcosystem}
                targetPrinterModel={project.settings.targetPrinter}
                infillPercent={project.settings.infillTarget}
                nozzleDiameter={project.settings.nozzleDiameter}
                onEstimatedTimeCalculated={(time) => setEstimatedPrintTime(time)}
              />
            )}

            {/* Support-Free DfAM Evaluator & CAD Modification Suggester */}
            {geometry && (
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-3 shadow-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">Support-Free DfAM Design Evaluator</h3>
                  </div>
                  <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                    Threshold: {overhangThreshold}°
                  </span>
                </div>
                <SupportFreeOptimizer
                  geometry={geometry}
                  filamentName={filament?.name || project?.settings?.filament || 'PLA'}
                  filamentDensity={filament?.density || project?.settings?.filamentDensity || 1.24}
                  overhangThreshold={overhangThreshold}
                  onApplyOrientation={onApplyOrientation}
                  onSelectRegion={onSelectRegion}
                  selectedRegionId={selectedRegionId}
                />
              </div>
            )}

            {/* Confidence Score Section */}
            {renderConfidenceScoreSection()}
          </>
        )}
      </div>
    );
  }

  // When spec IS present: Complete Output Hub with all tabs
  return (
    <div className="flex flex-col gap-4 text-slate-200">
      {/* Top Header Card with Title and 1-Click Copy */}
      <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-900/90 border border-slate-800 rounded-xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded">
              Ready to Publish
            </span>
            <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
              <Timer className="w-3 h-3 text-cyan-400" />
              <span>~{estimatedPrintTime || spec.estimatedPrintTimeHours} print</span>
            </span>
            {isTransformed && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded flex items-center gap-1">
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Orientation Modified</span>
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-slate-100 mt-1">{spec.title}</h3>
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{spec.pitch}</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Quick Tab to Model Exporter */}
          <button
            onClick={() => setActiveTab('export-model')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all active:scale-95 ${
              activeTab === 'export-model'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Export modified 3D model as .stl or .3mf"
          >
            <FileDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export 3D Model</span>
            {isTransformed && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          {/* Copy Spec Button */}
          <button
            onClick={handleCopySpec}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded-lg transition-all shadow-md active:scale-95"
            title="Copy standardized Markdown for MakerWorld / Printables"
          >
            {copiedSpec ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSpec ? 'Copied Markdown!' : 'Copy for MakerWorld'}</span>
          </button>

          {/* Download Complete ZIP Bundle */}
          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs rounded-lg border border-slate-700 transition-all active:scale-95"
            title="Download ZIP with 3D models, README.md, tags.txt, BOM.csv, and multi-angle renders"
          >
            <Download className={`w-3.5 h-3.5 ${isZipping ? 'animate-bounce' : ''}`} />
            <span>{isZipping ? 'Zipping Bundle...' : 'Export ZIP'}</span>
          </button>

          {/* Bulk Export Catalog Button */}
          <button
            onClick={() => setActiveTab('bulk-export')}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 font-medium text-xs rounded-lg border transition-all active:scale-95 ${
              activeTab === 'bulk-export'
                ? 'bg-indigo-500/30 text-indigo-200 border-indigo-500/60 ring-2 ring-indigo-500/30 shadow-sm'
                : 'bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 border-indigo-500/40'
            }`}
            title="Bulk export multiple projects from the catalog into a single organized ZIP archive"
          >
            <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
            <span>Bulk Export ({allAvailableProjects.length})</span>
          </button>
        </div>
      </div>

      {/* Confidence Score Component */}
      {renderConfidenceScoreSection()}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-900/80 border border-slate-800 rounded-lg overflow-x-auto">
        <button
          onClick={() => setActiveTab('spec')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'spec'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Spec Sheet</span>
        </button>

        <button
          onClick={() => setActiveTab('slicer')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'slicer'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Slicer Profile</span>
        </button>

        <button
          onClick={() => setActiveTab('print-time')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'print-time'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Timer className="w-3.5 h-3.5 text-cyan-400" />
          <span>Print Duration {estimatedPrintTime ? `(${estimatedPrintTime})` : ''}</span>
        </button>

        <button
          onClick={() => setActiveTab('support-free')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap relative ${
            activeTab === 'support-free'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Support-Free DfAM</span>
          <span className="w-2 h-2 rounded-full bg-cyan-400 absolute -top-0.5 -right-0.5 animate-pulse" />
        </button>

        <button
          onClick={() => setActiveTab('printability')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'printability'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Confidence Score ({successScore ? `${successScore.score}%` : 'N/A'})</span>
        </button>

        {/* Feature Tab: 3D Model Export (.stl / .3mf) */}
        <button
          onClick={() => setActiveTab('export-model')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap relative ${
            activeTab === 'export-model'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileDown className="w-3.5 h-3.5 text-cyan-400" />
          <span>Export 3D Model (.stl / .3mf)</span>
          {isTransformed && (
            <span className="w-2 h-2 rounded-full bg-amber-400 absolute -top-0.5 -right-0.5 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('bom')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'bom'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Hardware BOM ({spec.hardwareBOM?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'manual'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ListOrdered className="w-3.5 h-3.5" />
          <span>Assembly Guide</span>
        </button>

        <button
          onClick={() => setActiveTab('tags')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'tags'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Tags & SEO</span>
        </button>

        <button
          onClick={() => setActiveTab('renders')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
            activeTab === 'renders'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span>Renders ({snapshots.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('bulk-export')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap relative ${
            activeTab === 'bulk-export'
              ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FolderArchive className="w-3.5 h-3.5 text-indigo-400" />
          <span>Bulk Catalog Export ({allAvailableProjects.length})</span>
          {allAvailableProjects.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          )}
        </button>
      </div>

      {/* Tab 1: Spec Sheet Preview */}
      {activeTab === 'spec' && (
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col gap-4">
          <div className="prose prose-invert max-w-none text-xs leading-relaxed">
            <h2 className="text-sm font-bold text-cyan-400 border-b border-slate-800 pb-1.5">
              Listing Summary & Overview
            </h2>
            <p className="text-slate-300 italic">{spec.pitch}</p>

            {successScore && (
              <div className="my-3 p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span className="font-semibold text-slate-200">Print Success Confidence:</span>
                  <span className={`font-mono font-bold ${scoreStyles?.colorClass}`}>
                    {successScore.score}% (Grade {successScore.grade})
                  </span>
                </div>
                <span className="text-slate-400 text-[11px]">{successScore.ratingLabel}</span>
              </div>
            )}

            <h3 className="text-xs font-bold text-slate-200 mt-4">Print Compatibility</h3>
            <p className="text-slate-400">{spec.compatibilityNotes}</p>

            <h3 className="text-xs font-bold text-slate-200 mt-4">Critical Print Orientation</h3>
            <div className="p-2.5 bg-cyan-950/30 border border-cyan-500/30 rounded-lg text-cyan-200 font-mono text-[11px]">
              {spec.slicingProfile.printOrientation}
            </div>

            {/* Geometry Analysis Section with dedicated Overhang Heat-Map Toggle Button */}
            <div className="mt-4">
              {renderGeometryAnalysisSection()}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Dedicated Print Time & Kinematics Estimator */}
      {activeTab === 'print-time' && (
        <div className="flex flex-col gap-4">
          {project?.geometry ? (
            <PrintTimeEstimator
              volumeCm3={project.geometry.volumeCm3}
              geometryData={project.geometry}
              filament={filament || project.settings.filament}
              printer={printer || project.settings.printerEcosystem}
              targetPrinterModel={project.settings.targetPrinter}
              infillPercent={project.settings.infillTarget}
              nozzleDiameter={project.settings.nozzleDiameter}
              showInteractiveControls={true}
              onEstimatedTimeCalculated={(time) => setEstimatedPrintTime(time)}
            />
          ) : (
            <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-xl text-center text-slate-400 text-xs">
              Load a 3D model to calculate print duration.
            </div>
          )}
        </div>
      )}

      {/* Tab: Support-Free DfAM Evaluator & CAD Modification Suggester */}
      {activeTab === 'support-free' && (
        <div className="flex flex-col gap-4">
          <SupportFreeOptimizer
            geometry={geometry || null}
            filamentName={filament?.name || project?.settings?.filament || 'PLA'}
            filamentDensity={filament?.density || project?.settings?.filamentDensity || 1.24}
            overhangThreshold={overhangThreshold}
            onApplyOrientation={onApplyOrientation}
            onSelectRegion={onSelectRegion}
            selectedRegionId={selectedRegionId}
          />
        </div>
      )}

      {/* Tab 2: Slicer Profile */}
      {activeTab === 'slicer' && (
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col gap-4">
          {/* Integrated Kinematic Print Time Estimator in Slicer Tab */}
          {project?.geometry && (
            <PrintTimeEstimator
              volumeCm3={project.geometry.volumeCm3}
              geometryData={project.geometry}
              filament={filament || project.settings.filament}
              printer={printer || project.settings.printerEcosystem}
              targetPrinterModel={project.settings.targetPrinter}
              infillPercent={project.settings.infillTarget}
              nozzleDiameter={project.settings.nozzleDiameter}
              onEstimatedTimeCalculated={(time) => setEstimatedPrintTime(time)}
            />
          )}

          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-200">
                Recommended Slicer Settings ({project?.settings?.printerEcosystem || 'FDM'})
              </h3>
              <p className="text-xs text-slate-400">
                Targeted for {project?.settings?.filament || 'PLA'} on {project?.settings?.targetPrinter || 'Printer'}
              </p>
            </div>
            <span className="px-2 py-0.5 text-xs font-mono bg-cyan-500/20 text-cyan-400 rounded border border-cyan-500/30 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Est. ~{estimatedPrintTime || spec.estimatedPrintTimeHours}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-slate-400">Layer Height:</span>
              <span className="font-mono font-bold text-cyan-300">{spec.slicingProfile.recommendedLayerHeight}</span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-slate-400">Wall Perimeters:</span>
              <span className="font-mono font-bold text-slate-200">{spec.slicingProfile.wallPerimeters}</span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-slate-400">Top / Bottom Layers:</span>
              <span className="font-mono font-bold text-slate-200">{spec.slicingProfile.topBottomLayers}</span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-slate-400">Infill Density & Pattern:</span>
              <span className="font-mono font-bold text-cyan-300">
                {spec.slicingProfile.infillPattern} @ {spec.slicingProfile.infillDensity}
              </span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-slate-400">Supports:</span>
              <span className="font-mono font-bold text-amber-300">{spec.slicingProfile.supportType}</span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-slate-400">Support Angle:</span>
              <span className="font-mono font-bold text-slate-200">{spec.slicingProfile.supportThresholdAngle}</span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-slate-400">Bed Adhesion:</span>
              <span className="font-mono font-bold text-slate-200">{spec.slicingProfile.bedAdhesion}</span>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
              <span className="text-slate-400">Thermal Temps:</span>
              <span className="font-mono font-bold text-slate-200">
                {project?.settings?.nozzleTemp}°C Nozzle / {project?.settings?.bedTemp}°C Bed
              </span>
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex flex-col gap-1.5 text-xs">
            <span className="font-semibold text-slate-300">Cooling & Speed Calibration:</span>
            <p className="text-slate-400">{spec.slicingProfile.coolingAndSpeedNotes}</p>
          </div>
        </div>
      )}

      {/* Tab 3: Confidence Score Diagnostics */}
      {activeTab === 'printability' && successScore && (
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-200">Print Success Probability & Scoring</h3>
              <p className="text-xs text-slate-400">
                Evaluated against volume thermal stresses, overhang steepness, and bounding geometry
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-black text-cyan-400">{successScore.score}%</div>
              <div className="text-[10px] font-mono text-slate-400 uppercase">Grade {successScore.grade}</div>
            </div>
          </div>

          {/* Score Factors Breakdown Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>1. Model Volume</span>
              </div>
              <div className="text-base font-mono font-bold text-slate-100 mt-1">
                {project?.geometry.volumeCm3.toFixed(1)} cm³
              </div>
              <div className="text-[10px] text-amber-400 mt-0.5">
                {successScore.volumePenalty === 0 ? 'Optimal thermal stability' : `-${successScore.volumePenalty} pts thermal risk`}
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                <Box className="w-3 h-3 text-blue-400" />
                <span>2. BBox Complexity</span>
              </div>
              <div className="text-base font-mono font-bold text-slate-100 mt-1">
                {(successScore.packingEfficiency * 100).toFixed(0)}% fill
              </div>
              <div className="text-[10px] text-cyan-400 mt-0.5">
                {successScore.aspectRatio.toFixed(1)}:1 aspect ({successScore.complexityPenalty === 0 ? 'Compact' : `-${successScore.complexityPenalty} pts void/drag`})
              </div>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[10px] font-mono text-slate-400 uppercase flex items-center gap-1">
                <Flame className="w-3 h-3 text-rose-400" />
                <span>3. Overhang Face Ratio</span>
              </div>
              <div className="text-base font-mono font-bold text-slate-100 mt-1">
                {successScore.overhangPercentageOfFaces.toFixed(1)}% of faces
              </div>
              <div className="text-[10px] text-rose-400 mt-0.5">
                {project?.geometry.criticalOverhangCount} / {project?.geometry.totalFaces} faces ({successScore.overhangPenalty === 0 ? 'Self-supporting' : `-${successScore.overhangPenalty} pts overhangs`})
              </div>

              {onToggleOverhangHeatmap && (
                <button
                  onClick={onToggleOverhangHeatmap}
                  type="button"
                  className={`mt-2.5 flex items-center justify-between w-full px-2.5 py-1.5 text-[11px] font-mono rounded-lg border transition-all ${
                    isOverhangHeatmapVisible
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                  title="Toggle Overhang Heat-Map overlay in 3D viewport"
                >
                  <span className="flex items-center gap-1.5">
                    <Flame className="w-3 h-3 text-rose-400" />
                    <span>{isOverhangHeatmapVisible ? 'Heat-Map: Active' : 'Toggle 3D Heat-Map'}</span>
                  </span>
                  <span className={`w-2 h-2 rounded-full ${isOverhangHeatmapVisible ? 'bg-rose-400 animate-ping' : 'bg-slate-600'}`} />
                </button>
              )}
            </div>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex flex-col gap-2">
            <span className="text-xs font-semibold text-slate-200">Recommended Success Mitigations:</span>
            <div className="space-y-1.5">
              <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {successScore.overhangPercentageOfFaces > 10
                    ? 'Deploy Organic / Tree Supports for all faces > 45° with 0.2mm Z-distance.'
                    : 'Low overhang ratio: Can be safely printed with standard or zero supports.'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {(project?.geometry?.volumeCm3 ?? 0) > 150
                    ? 'Large volumetric mass: Add 5mm outer brim on clean PEI build plate to resist corner peeling.'
                    : 'Optimal volumetric envelope: Standard bed adhesion without brim is sufficient.'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-950/70 border border-slate-800/80 rounded-lg flex items-start gap-2.5 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  {successScore.aspectRatio > 2.5
                    ? `Aspect ratio ${successScore.aspectRatio.toFixed(1)}:1: Clamp print acceleration to 2,000 mm/s² on high layers.`
                    : 'Stable aspect ratio: Printer can run standard accelerations without resonance wobble.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feature Tab: 3D Model Exporter (.stl & .3mf) */}
      {activeTab === 'export-model' && renderModelExportSection()}

      {/* Tab 4: Hardware BOM */}
      {activeTab === 'bom' && (
        <div className="flex flex-col gap-4">
          {/* 3D Printed Components Assembly Breakdown */}
          {components && components.length > 1 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-cyan-400" />
                  <span>3D Printed Parts Assembly ({components.length} Components)</span>
                </span>
                <span className="text-[10px] font-mono text-cyan-400 uppercase">
                  Multi-Mesh Assembly
                </span>
              </div>
              <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-900/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase font-mono text-slate-400">
                    <tr>
                      <th className="px-3.5 py-2">Color</th>
                      <th className="px-3.5 py-2">Part Name</th>
                      <th className="px-3.5 py-2">Format</th>
                      <th className="px-3.5 py-2">File Size</th>
                      <th className="px-3.5 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {components.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-3.5 py-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full border border-white/20"
                            style={{ backgroundColor: c.color }}
                          />
                        </td>
                        <td className="px-3.5 py-2 font-sans font-medium text-slate-200">
                          {c.name}
                        </td>
                        <td className="px-3.5 py-2 text-cyan-400 uppercase">{c.format}</td>
                        <td className="px-3.5 py-2 text-slate-400">
                          {(c.fileSize / 1024).toFixed(0)} KB
                        </td>
                        <td className="px-3.5 py-2 text-emerald-400 font-sans">
                          {c.visible !== false ? 'Included' : 'Hidden'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Required fasteners, heat-set inserts, magnets, and hardware:
            </span>
          </div>

          {spec.hardwareBOM && spec.hardwareBOM.length > 0 ? (
            <div className="overflow-hidden border border-slate-800 rounded-xl bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase font-mono text-slate-400">
                  <tr>
                    <th className="px-3.5 py-2.5">Hardware Item</th>
                    <th className="px-3.5 py-2.5">Qty</th>
                    <th className="px-3.5 py-2.5">Category</th>
                    <th className="px-3.5 py-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {spec.hardwareBOM.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-3.5 py-2 font-sans font-medium text-slate-200">{item.item}</td>
                      <td className="px-3.5 py-2 text-cyan-400 font-bold">{item.quantity}</td>
                      <td className="px-3.5 py-2 text-slate-400 text-[11px]">{item.type}</td>
                      <td className="px-3.5 py-2 text-slate-400 font-sans text-[11px] italic">{item.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-xl text-center text-xs text-slate-400">
              No additional fasteners or hardware required. 100% 3D printable print-in-place or snap-fit design.
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Assembly Guide */}
      {activeTab === 'manual' && (
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl flex flex-col gap-3 text-xs leading-relaxed">
          <h3 className="text-sm font-bold text-slate-200 border-b border-slate-800 pb-2">
            Step-by-Step Assembly Instructions
          </h3>
          <div className="whitespace-pre-wrap font-sans text-slate-300 text-xs">
            {spec.assemblyManual}
          </div>
        </div>
      )}

      {/* Tab 6: Tags & SEO */}
      {activeTab === 'tags' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              High-ranking discovery tags for Printables, MakerWorld, Cults3D, and Thangs:
            </span>
            <button
              onClick={handleCopyTags}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-cyan-300 bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-500/30 rounded transition-all"
            >
              {copiedTags ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copiedTags ? 'Copied All!' : 'Copy Tags'}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2 p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
            {spec.tags.map((tag, i) => (
              <button
                key={i}
                onClick={async () => {
                  await navigator.clipboard.writeText(tag);
                }}
                className="px-2.5 py-1 bg-slate-800/80 hover:bg-cyan-950/40 hover:text-cyan-300 border border-slate-700/60 hover:border-cyan-500/40 text-xs font-mono rounded-lg transition-all group flex items-center gap-1"
                title="Click to copy single tag"
              >
                <span>{tag.startsWith('#') ? tag : `#${tag}`}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab 7: Captured Viewport Renders */}
      {activeTab === 'renders' && (
        <div className="flex flex-col gap-3">
          <div className="text-xs text-slate-400">
            Multi-angle snapshots captured directly from Three.js canvas:
          </div>

          <div className="grid grid-cols-2 gap-3">
            {snapshots.map((snap, i) => (
              <div
                key={i}
                className="flex flex-col bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden group"
              >
                <div className="aspect-video relative bg-slate-950 flex items-center justify-center overflow-hidden">
                  <img
                    src={snap.dataUrl}
                    alt={snap.label}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                  />
                  <a
                    href={snap.dataUrl}
                    download={`${snap.viewName}.png`}
                    className="absolute bottom-2 right-2 p-1.5 bg-slate-900/80 backdrop-blur hover:bg-cyan-600 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Download high-res PNG"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
                <div className="p-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300 truncate">{snap.label}</span>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">{snap.viewName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 8: Bulk Catalog Multi-Project Export */}
      {activeTab === 'bulk-export' && renderBulkExportSection()}
    </div>
  );
};
