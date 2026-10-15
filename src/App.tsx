/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
  Layers,
  Upload,
  Sparkles,
  FileBox,
  Sliders,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  History,
  Tag,
  Share2,
  Printer,
  ChevronRight,
  RefreshCw,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { CADViewer, ShadingMode } from './components/CADViewer';
import { ControlPanel } from './components/ControlPanel';
import { OutputHub } from './components/OutputHub';
import { ProjectHistory } from './components/ProjectHistory';
import { loadModelFile, loadMultipleModelFiles, mergeComponentGeometries } from './utils/fileLoader';
import { computeGeometryData } from './utils/geometryMath';
import { SAMPLE_MODELS } from './utils/sampleModels';
import { INITIAL_CATALOG_PROJECTS } from './utils/sampleCatalog';
import { FILAMENT_PRESETS, PRINTER_ECOSYSTEMS } from './utils/constants';
import {
  CADProject,
  FilamentOption,
  FunctionalIntent,
  GeometryData,
  PrinterEcosystem,
  ViewportSnapshot,
  GeneratedSpec,
  MeshComponent,
  OverhangRegion,
} from './types/cad';

const LOCAL_STORAGE_KEY = 'cad_tagger_projects_v1';

export default function App() {
  // 3D Geometry and File State
  const [currentGeometry, setCurrentGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [originalGeometry, setOriginalGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [isTransformed, setIsTransformed] = useState<boolean>(false);
  const [transformHistory, setTransformHistory] = useState<string[]>([]);
  const [currentFileName, setCurrentFileName] = useState<string>('Gridfinity_2x2_Bin.stl');
  const [currentFileSize, setCurrentFileSize] = useState<number>(1024 * 48);
  const [currentFormat, setCurrentFormat] = useState<string>('stl');
  const [geometryData, setGeometryData] = useState<GeometryData | null>(null);

  // Multi-Component 3D Mesh Assembly State
  const [components, setComponents] = useState<MeshComponent[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);

  // Support-Free DfAM Selected Overhang Region State
  const [selectedOverhangRegion, setSelectedOverhangRegion] = useState<OverhangRegion | null>(null);

  // Viewport Shading & Overhang Heat-Map Overlay State
  const [shadingMode, setShadingMode] = useState<ShadingMode>('cad');
  const handleToggleOverhangHeatmap = useCallback(() => {
    setShadingMode((prev) => (prev === 'overhang' ? 'cad' : 'overhang'));
  }, []);

  // Slicer & Machine Settings
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterEcosystem>(PRINTER_ECOSYSTEMS[0]);
  const [targetPrinterModel, setTargetPrinterModel] = useState<string>(PRINTER_ECOSYSTEMS[0].popularModels[0]);
  const [selectedFilament, setSelectedFilament] = useState<FilamentOption>(FILAMENT_PRESETS[0]);
  const [nozzleTemp, setNozzleTemp] = useState<number>(FILAMENT_PRESETS[0].nozzleTemp);
  const [bedTemp, setBedTemp] = useState<number>(FILAMENT_PRESETS[0].bedTemp);
  const [functionalIntent, setFunctionalIntent] = useState<FunctionalIntent>('Mechanical / Structural');
  const [nozzleDiameter, setNozzleDiameter] = useState<string>('0.4mm');
  const [infillTarget, setInfillTarget] = useState<number>(25);
  const [overhangThreshold, setOverhangThreshold] = useState<number>(45);
  const [userNotes, setUserNotes] = useState<string>('');

  // Viewport Snapshots & AI Spec State
  const [snapshots, setSnapshots] = useState<ViewportSnapshot[]>([]);
  const [currentSpec, setCurrentSpec] = useState<GeneratedSpec | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Right Panel Tab Navigation & Collapsibility
  const [activeRightTab, setActiveRightTab] = useState<'configure' | 'output' | 'history'>('configure');
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState<boolean>(false);

  // Keyboard shortcut to toggle right panel (e.g. ']' or 'Ctrl/Alt+B')
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === ']' || (e.altKey && e.key.toLowerCase() === 'b')) {
        e.preventDefault();
        setIsRightPanelCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Local Catalog / History State
  const [projects, setProjects] = useState<CADProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Drag and drop state
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Initial Sample Model on mount
  useEffect(() => {
    loadSampleById('gridfinity_bin');

    // Load saved projects from localStorage
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setProjects(parsed);
          return;
        }
      }
    } catch (e) {
      console.error('Failed reading saved projects from localStorage:', e);
    }
    // Seed initial catalog projects if no projects saved yet
    setProjects(INITIAL_CATALOG_PROJECTS);
  }, []);

  // Save projects to localStorage whenever changed
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
      console.error('Failed saving projects to localStorage:', e);
    }
  }, [projects]);

  // Update thermal settings when filament changes
  const handleSelectFilament = (filament: FilamentOption) => {
    setSelectedFilament(filament);
    setNozzleTemp(filament.nozzleTemp);
    setBedTemp(filament.bedTemp);

    // Recompute mass based on new filament density
    if (currentGeometry) {
      const updatedData = computeGeometryData(currentGeometry, filament.density, overhangThreshold, 'Z');
      setGeometryData(updatedData);
    }
  };

  // Recompute overhang & mass when threshold changes
  const handleOverhangThresholdChange = (angle: number) => {
    setOverhangThreshold(angle);
    if (currentGeometry) {
      const updatedData = computeGeometryData(currentGeometry, selectedFilament.density, angle, 'Z');
      setGeometryData(updatedData);
    }
  };

  // Load procedural sample model (supports multi-part assemblies)
  const loadSampleById = useCallback(
    (sampleId: string) => {
      const sample = SAMPLE_MODELS.find((s) => s.id === sampleId) || SAMPLE_MODELS[0];
      let comps: MeshComponent[] = [];
      let geo: THREE.BufferGeometry;

      if (sample.generateComponents) {
        comps = sample.generateComponents();
        geo = mergeComponentGeometries(comps);
      } else {
        geo = sample.generate();
        comps = [
          {
            id: `comp-${sample.id}`,
            name: sample.name,
            fileName: `${sample.name.replace(/\s+/g, '_')}.stl`,
            fileSize: 1024 * 64,
            format: 'stl',
            geometry: geo,
            originalGeometry: geo.clone(),
            color: '#06b6d4',
            visible: true,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
        ];
      }

      const geomData = computeGeometryData(geo, selectedFilament.density, overhangThreshold, 'Z');

      setComponents(comps);
      setSelectedComponentId(null);
      setCurrentGeometry(geo);
      setOriginalGeometry(geo.clone());
      setIsTransformed(false);
      setTransformHistory([]);
      setGeometryData(geomData);
      setCurrentFileName(
        comps.length > 1
          ? `${comps.length} Components (${sample.name})`
          : `${sample.name.replace(/\s+/g, '_')}.stl`
      );
      setCurrentFileSize(1024 * 64 * Math.max(1, comps.length));
      setCurrentFormat(comps.length > 1 ? 'assembly' : 'stl');
      setFunctionalIntent(sample.intent);
      setCurrentSpec(null);
      setSnapshots([]);
      setErrorMsg(null);
      setActiveRightTab('configure');
    },
    [selectedFilament.density, overhangThreshold]
  );

  // Handle File Upload (.stl, .3mf, .step) - supports single or multiple files simultaneously
  const handleFileUpload = async (filesOrFile: File | File[]) => {
    setErrorMsg(null);
    try {
      const result = await loadModelFile(filesOrFile);
      const geomData = computeGeometryData(result.geometry, selectedFilament.density, overhangThreshold, 'Z');

      setComponents(result.components || []);
      setSelectedComponentId(null);
      setCurrentGeometry(result.geometry);
      setOriginalGeometry(result.geometry.clone());
      setIsTransformed(false);
      setTransformHistory([]);
      setGeometryData(geomData);
      setCurrentFileName(result.fileName);
      setCurrentFileSize(result.fileSize);
      setCurrentFormat(result.format);
      setCurrentSpec(null);
      setSnapshots([]);
      setActiveRightTab('configure');
    } catch (err: any) {
      console.error('File load error:', err);
      setErrorMsg(err.message || 'Failed to parse CAD model file(s).');
    }
  };

  // Import additional component parts into current assembly
  const handleImportMoreFiles = async (files: File[]) => {
    try {
      const result = await loadMultipleModelFiles(files);
      const combined = [...components, ...result.components];
      const combinedGeo = mergeComponentGeometries(combined);
      const geomData = computeGeometryData(combinedGeo, selectedFilament.density, overhangThreshold, 'Z');

      setComponents(combined);
      setCurrentGeometry(combinedGeo);
      setGeometryData(geomData);
      setCurrentFileName(`${combined.length} Components Assembly`);
      setCurrentFormat('assembly');
      setIsTransformed(true);
      setTransformHistory((prev) => [
        ...prev,
        `Imported ${files.length} additional component(s) into assembly`,
      ]);
    } catch (err: any) {
      console.error('Import more files error:', err);
      setErrorMsg(err.message || 'Failed to import additional component(s).');
    }
  };

  // Handle component assembly updates (position, visibility, explode, arrange)
  const handleComponentsChanged = useCallback(
    (updatedComponents: MeshComponent[], updatedAssemblyGeo?: THREE.BufferGeometry) => {
      setComponents(updatedComponents);
      const finalGeo = updatedAssemblyGeo || mergeComponentGeometries(updatedComponents);
      const geomData = computeGeometryData(finalGeo, selectedFilament.density, overhangThreshold, 'Z');
      setCurrentGeometry(finalGeo);
      setGeometryData(geomData);
      setIsTransformed(true);
    },
    [selectedFilament.density, overhangThreshold]
  );

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(Array.from(e.dataTransfer.files));
    }
  };

  // Store snapshots captured from 3D canvas
  const handleSnapshotsCaptured = (snaps: ViewportSnapshot[]) => {
    setSnapshots(snaps);
  };

  // Handle direct model rotation or movement (grid stays stationary)
  const handleGeometryTransformed = useCallback(
    (newGeometry: THREE.BufferGeometry, reason?: string) => {
      const updatedData = computeGeometryData(newGeometry, selectedFilament.density, overhangThreshold, 'Z');
      setCurrentGeometry(newGeometry);
      setGeometryData(updatedData);
      setIsTransformed(true);
      if (reason) {
        setTransformHistory((prev) => [...prev, reason]);
      } else {
        setTransformHistory((prev) => [...prev, 'Model transformed in 3D viewport']);
      }
    },
    [selectedFilament.density, overhangThreshold]
  );

  // Reset model / components to original imported/sample orientation
  const handleResetTransformations = useCallback(() => {
    if (components.length > 0) {
      const restoredComps = components.map((c) => ({
        ...c,
        position: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        geometry: c.originalGeometry ? c.originalGeometry.clone() : c.geometry,
        isTransformed: false,
      }));
      setComponents(restoredComps);
      const composite = mergeComponentGeometries(restoredComps);
      const updatedData = computeGeometryData(composite, selectedFilament.density, overhangThreshold, 'Z');
      setCurrentGeometry(composite);
      setGeometryData(updatedData);
      setIsTransformed(false);
      setTransformHistory([]);
      return;
    }

    if (originalGeometry) {
      const restored = originalGeometry.clone();
      const updatedData = computeGeometryData(restored, selectedFilament.density, overhangThreshold, 'Z');
      setCurrentGeometry(restored);
      setGeometryData(updatedData);
      setIsTransformed(false);
      setTransformHistory([]);
    }
  }, [components, originalGeometry, selectedFilament.density, overhangThreshold]);

  // Apply canonical build plate orientation (support-free rotation)
  const handleApplyOrientation = useCallback(
    (axis: 'X' | 'Y' | 'Z', degrees: number) => {
      if (!currentGeometry) return;
      const rad = THREE.MathUtils.degToRad(degrees);
      const cloned = currentGeometry.clone();
      const rot = new THREE.Euler(
        axis === 'X' ? rad : 0,
        axis === 'Y' ? rad : 0,
        axis === 'Z' ? rad : 0,
        'XYZ'
      );
      const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(rot);
      cloned.applyMatrix4(rotMatrix);
      cloned.computeBoundingBox();
      if (cloned.boundingBox) {
        // Ground model on print bed at Z = 0
        const minZ = cloned.boundingBox.min.z;
        cloned.translate(0, 0, -minZ);
        cloned.computeBoundingBox();
      }
      cloned.computeVertexNormals();

      if (components.length > 0) {
        const updated = components.map((c) => {
          const compGeo = c.geometry.clone();
          compGeo.applyMatrix4(rotMatrix);
          compGeo.computeBoundingBox();
          if (cloned.boundingBox && compGeo.boundingBox) {
            compGeo.translate(0, 0, -cloned.boundingBox.min.z);
          }
          return {
            ...c,
            geometry: compGeo,
            isTransformed: true,
          };
        });
        handleComponentsChanged(updated, cloned);
      } else {
        handleGeometryTransformed(
          cloned,
          `Rotated ${degrees}° along ${axis}-axis for support-free print optimization`
        );
      }
    },
    [currentGeometry, components, handleComponentsChanged, handleGeometryTransformed]
  );

  // Jump to DfAM Optimizer tab in right panel
  const handleOpenDfAMHub = useCallback(() => {
    setIsRightPanelCollapsed(false);
    setActiveRightTab('output');
  }, []);

  // Trigger Gemini Analysis
  const handleTriggerGenerate = async () => {
    if (!currentGeometry || !geometryData) {
      setErrorMsg('Please load a 3D model first.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setGenerationStep('Capturing multi-angle viewport renders...');

    try {
      // 1. Ensure we have snapshots. If none captured yet, wait a moment or let CADViewer capture
      let currentSnaps = snapshots;
      if (currentSnaps.length === 0) {
        // Trigger capture via synthetic event or wait for state
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      setGenerationStep('Computing mesh topology & overhang normal angles...');
      await new Promise((resolve) => setTimeout(resolve, 300));

      setGenerationStep('Transmitting multi-modal payload to Gemini (gemini-2.5-flash)...');

      const payload = {
        modelName: 'gemini-2.5-flash',
        images: currentSnaps.length > 0 ? currentSnaps : [],
        geometry: geometryData,
        settings: {
          fileName: currentFileName,
          printerEcosystem: selectedPrinter.brand,
          targetPrinter: targetPrinterModel,
          filament: selectedFilament.name,
          filamentDensity: selectedFilament.density,
          nozzleTemp,
          bedTemp,
          functionalIntent,
          nozzleDiameter,
          infillTarget,
          userNotes,
        },
      };

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Gemini analysis failed.');
      }

      setGenerationStep('Formatting slicer matrix & assembly documentation...');
      const specData: GeneratedSpec = data.data;
      setCurrentSpec(specData);
      setActiveRightTab('output');

      // Save to Project History
      const newProjectId = `proj_${Date.now()}`;
      const newProject: CADProject = {
        id: newProjectId,
        fileName: currentFileName,
        fileSize: currentFileSize,
        fileType: currentFormat,
        timestamp: Date.now(),
        geometry: geometryData,
        settings: {
          printerEcosystem: selectedPrinter.brand,
          targetPrinter: targetPrinterModel,
          filament: selectedFilament.name,
          filamentDensity: selectedFilament.density,
          nozzleTemp,
          bedTemp,
          functionalIntent,
          nozzleDiameter,
          infillTarget,
          userNotes,
        },
        spec: specData,
        snapshots: currentSnaps,
      };

      setCurrentProjectId(newProjectId);
      setProjects((prev) => [newProject, ...prev.filter((p) => p.fileName !== currentFileName)]);
    } catch (err: any) {
      console.error('Generation error:', err);
      setErrorMsg(err.message || 'Failed to complete Gemini analysis.');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  // Select project from history
  const handleSelectHistoryProject = (proj: CADProject) => {
    setCurrentProjectId(proj.id);
    setCurrentFileName(proj.fileName);
    setCurrentFileSize(proj.fileSize);
    setCurrentFormat(proj.fileType);
    setGeometryData(proj.geometry);
    setCurrentSpec(proj.spec);
    setSnapshots(proj.snapshots);

    // Restore settings
    const printer = PRINTER_ECOSYSTEMS.find((p) => p.brand === proj.settings.printerEcosystem) || PRINTER_ECOSYSTEMS[0];
    setSelectedPrinter(printer);
    setTargetPrinterModel(proj.settings.targetPrinter || printer.popularModels[0]);

    const filament = FILAMENT_PRESETS.find((f) => f.name === proj.settings.filament) || FILAMENT_PRESETS[0];
    setSelectedFilament(filament);
    setNozzleTemp(proj.settings.nozzleTemp);
    setBedTemp(proj.settings.bedTemp);
    setFunctionalIntent(proj.settings.functionalIntent);
    setNozzleDiameter(proj.settings.nozzleDiameter);
    setInfillTarget(proj.settings.infillTarget);
    setUserNotes(proj.settings.userNotes);

    setActiveRightTab('output');
  };

  const handleDeleteHistoryProject = (projectId: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (currentProjectId === projectId) {
      setCurrentProjectId(null);
    }
  };

  const handleClearAllHistory = () => {
    setProjects([]);
    setCurrentProjectId(null);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans"
    >
      {/* Drag & Drop Fullscreen Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-cyan-950/80 backdrop-blur-md border-4 border-dashed border-cyan-400 flex flex-col items-center justify-center pointer-events-none animate-pulse">
          <Upload className="w-16 h-16 text-cyan-300 mb-4 animate-bounce" />
          <h2 className="text-xl font-bold text-white">Drop 3D Model File (.stl, .3mf, .step)</h2>
          <p className="text-sm text-cyan-200 mt-2">Instant mesh telemetry & slicer spec generation</p>
        </div>
      )}

      {/* Top Application Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-950">
              <FileBox className="w-4 h-4 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-sm text-white">CAD-TAGGER</span>
                <span className="px-1.5 py-0.2 text-[9px] font-mono uppercase bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded">
                  v2.5
                </span>
              </div>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                Precision Spec & Slicer Profile Engine for Makers
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 ml-4 pl-4 border-l border-slate-800 text-[11px] text-slate-400 font-mono">
            <span>Export ready for:</span>
            <span className="text-slate-300 font-semibold">Printables</span>
            <span>•</span>
            <span className="text-cyan-400 font-semibold">MakerWorld</span>
            <span>•</span>
            <span className="text-slate-300 font-semibold">Cults3D</span>
            <span>•</span>
            <span className="text-slate-300 font-semibold">Thangs</span>
          </div>
        </div>

        {/* Action Controls in Header */}
        <div className="flex items-center gap-2.5">
          {/* Active Model Name Pill */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 max-w-[220px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="truncate">{currentFileName}</span>
            <span className="text-[10px] text-slate-500 uppercase">{currentFormat}</span>
          </div>

          {/* Upload Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors shadow-sm"
            title="Import .stl, .3mf, or .step files (Select multiple to assemble together)"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Import CAD Mesh</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".stl,.3mf,.step,.stp"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleFileUpload(Array.from(e.target.files));
              }
              e.target.value = '';
            }}
            className="hidden"
          />

          {/* Quick Trigger Button in Header if configured */}
          <button
            onClick={handleTriggerGenerate}
            disabled={!currentGeometry || isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-semibold rounded-lg shadow transition-colors"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Analyzing...' : 'Generate Spec'}</span>
          </button>

          {/* Right Panel Collapse / Expand Header Toggle */}
          <div className="w-[1px] h-5 bg-slate-800 mx-0.5" />
          <button
            onClick={() => setIsRightPanelCollapsed(!isRightPanelCollapsed)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              isRightPanelCollapsed
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 hover:bg-cyan-500/30'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
            title={isRightPanelCollapsed ? 'Expand Inspector Panel (Press ])' : 'Collapse Inspector Panel (Press ])'}
          >
            {isRightPanelCollapsed ? (
              <>
                <PanelRightOpen className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden xl:inline text-[11px]">Expand Panel</span>
              </>
            ) : (
              <>
                <PanelRightClose className="w-3.5 h-3.5" />
                <span className="hidden xl:inline text-[11px]">Collapse Panel</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Split-Screen Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Side: 3D Interactive WebGL Mesh Viewer & Geometry Telemetry */}
        <div
          className={`h-full relative border-slate-800 bg-slate-950 transition-all duration-300 ease-in-out ${
            isRightPanelCollapsed
              ? 'w-full'
              : 'w-full md:w-[58%] lg:w-[62%] h-1/2 md:h-full border-b md:border-b-0 md:border-r'
          }`}
        >
          <CADViewer
            geometry={currentGeometry}
            geometryData={geometryData}
            filamentColor={selectedFilament.color}
            overhangThreshold={overhangThreshold}
            onSnapshotsCaptured={handleSnapshotsCaptured}
            isCapturing={isGenerating}
            onGeometryTransformed={handleGeometryTransformed}
            isTransformed={isTransformed}
            onResetTransformations={handleResetTransformations}
            components={components}
            onComponentsChanged={handleComponentsChanged}
            onImportMoreFiles={handleImportMoreFiles}
            selectedComponentId={selectedComponentId}
            onSelectComponent={setSelectedComponentId}
            selectedRegion={selectedOverhangRegion}
            onSelectRegion={setSelectedOverhangRegion}
            onOpenDfAMHub={handleOpenDfAMHub}
            onLoadSample={loadSampleById}
            shadingMode={shadingMode}
            onShadingModeChange={setShadingMode}
          />
        </div>

        {/* Right Side: Slicing Configuration, Gemini Generator & Output Hub */}
        <div
          className={`flex flex-col bg-slate-950/95 overflow-hidden transition-all duration-300 ease-in-out ${
            isRightPanelCollapsed
              ? 'w-0 h-0 md:w-0 md:h-full opacity-0 pointer-events-none p-0 border-0'
              : 'w-full md:w-[42%] lg:w-[38%] h-1/2 md:h-full opacity-100'
          }`}
        >
          {/* Right Panel Navigation Bar */}
          <div className="p-2 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveRightTab('configure')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeRightTab === 'configure'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Printer & Material</span>
              </button>

              <button
                onClick={() => setActiveRightTab('output')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all relative ${
                  activeRightTab === 'output'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Spec & Slicer Hub</span>
                {currentSpec && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -right-0.5" />
                )}
              </button>

              <button
                onClick={() => setActiveRightTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  activeRightTab === 'history'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Catalog ({projects.length})</span>
              </button>
            </div>
          </div>

          {/* Active Tab Content Area */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {/* Error Message Alert */}
            {errorMsg && (
              <div className="mb-4 p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl flex items-start gap-2.5 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-rose-200">Operation Alert</div>
                  <div className="mt-0.5">{errorMsg}</div>
                </div>
              </div>
            )}

            {/* In-Flight Gemini Progress HUD */}
            {isGenerating && (
              <div className="mb-4 p-4 bg-gradient-to-r from-cyan-950/40 to-blue-950/40 border border-cyan-500/40 rounded-xl flex items-center gap-3 animate-pulse">
                <Sparkles className="w-5 h-5 text-cyan-400 animate-spin shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-cyan-200">CAD-Tagger Multimodal AI Pipeline</div>
                  <div className="text-[11px] font-mono text-cyan-400 mt-0.5">{generationStep}</div>
                </div>
              </div>
            )}

            {/* TAB 1: Slicer & Machine Configuration */}
            {activeRightTab === 'configure' && (
              <ControlPanel
                selectedPrinter={selectedPrinter}
                onSelectPrinter={setSelectedPrinter}
                targetPrinterModel={targetPrinterModel}
                onSelectTargetPrinterModel={setTargetPrinterModel}
                selectedFilament={selectedFilament}
                onSelectFilament={handleSelectFilament}
                nozzleTemp={nozzleTemp}
                onNozzleTempChange={setNozzleTemp}
                bedTemp={bedTemp}
                onBedTempChange={setBedTemp}
                functionalIntent={functionalIntent}
                onFunctionalIntentChange={setFunctionalIntent}
                nozzleDiameter={nozzleDiameter}
                onNozzleDiameterChange={setNozzleDiameter}
                infillTarget={infillTarget}
                onInfillTargetChange={setInfillTarget}
                overhangThreshold={overhangThreshold}
                onOverhangThresholdChange={handleOverhangThresholdChange}
                userNotes={userNotes}
                onUserNotesChange={setUserNotes}
                onLoadSample={loadSampleById}
                onTriggerGenerate={handleTriggerGenerate}
                isGenerating={isGenerating}
                hasGeometry={!!currentGeometry}
                hasSnapshots={snapshots.length > 0}
                onOpenDfAMHub={handleOpenDfAMHub}
              />
            )}

            {/* TAB 2: Output Spec Sheet, Slicer Matrix, Hardware BOM, and ZIP Exporter */}
            {activeRightTab === 'output' && (
              <OutputHub
                project={
                  geometryData
                    ? {
                        id: currentProjectId || 'current',
                        fileName: currentFileName,
                        fileSize: currentFileSize,
                        fileType: currentFormat,
                        timestamp: Date.now(),
                        geometry: geometryData,
                        settings: {
                          printerEcosystem: selectedPrinter.brand,
                          targetPrinter: targetPrinterModel,
                          filament: selectedFilament.name,
                          filamentDensity: selectedFilament.density,
                          nozzleTemp,
                          bedTemp,
                          functionalIntent,
                          nozzleDiameter,
                          infillTarget,
                          userNotes,
                        },
                        spec: currentSpec,
                        snapshots,
                      }
                    : null
                }
                spec={currentSpec}
                snapshots={snapshots}
                geometry={currentGeometry}
                isTransformed={isTransformed}
                transformDescriptions={transformHistory}
                onResetTransformations={handleResetTransformations}
                onTriggerGenerate={handleTriggerGenerate}
                isGenerating={isGenerating}
                filament={selectedFilament}
                printer={selectedPrinter}
                components={components}
                overhangThreshold={overhangThreshold}
                onApplyOrientation={handleApplyOrientation}
                onSelectRegion={setSelectedOverhangRegion}
                selectedRegionId={selectedOverhangRegion?.id || null}
                isOverhangHeatmapVisible={shadingMode === 'overhang'}
                onToggleOverhangHeatmap={handleToggleOverhangHeatmap}
                catalogProjects={projects}
                onSelectCatalogProject={handleSelectHistoryProject}
              />
            )}

            {/* TAB 3: Local History & Catalog */}
            {activeRightTab === 'history' && (
              <ProjectHistory
                projects={projects}
                currentProjectId={currentProjectId}
                onSelectProject={handleSelectHistoryProject}
                onDeleteProject={handleDeleteHistoryProject}
                onClearAll={handleClearAllHistory}
              />
            )}
          </div>
        </div>

        {/* Floating Quick Dock when Right Panel is Collapsed */}
        {isRightPanelCollapsed && (
          <aside
            aria-label="Collapsed Control Panel Dock"
            className="absolute right-3 top-20 z-30 flex flex-col items-center bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md p-1.5 gap-2 animate-in fade-in slide-in-from-right-4 duration-200"
          >
            <button
              onClick={() => setIsRightPanelCollapsed(false)}
              className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-all group relative flex items-center justify-center"
              title="Expand Inspector & Slicer Panel"
            >
              <PanelRightOpen className="w-5 h-5 transition-transform group-hover:scale-110" />
            </button>

            <div className="w-5 h-[1px] bg-slate-800 my-0.5" />

            <button
              onClick={() => {
                setActiveRightTab('configure');
                setIsRightPanelCollapsed(false);
              }}
              className={`p-2 rounded-lg transition-all text-xs flex items-center justify-center ${
                activeRightTab === 'configure'
                  ? 'text-cyan-400 bg-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Open Printer & Material Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setActiveRightTab('output');
                setIsRightPanelCollapsed(false);
              }}
              className={`p-2 rounded-lg transition-all text-xs relative flex items-center justify-center ${
                activeRightTab === 'output'
                  ? 'text-cyan-400 bg-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Open Spec & Slicer Hub"
            >
              <Tag className="w-4 h-4" />
              {currentSpec && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute top-1 right-1" />
              )}
            </button>

            <button
              onClick={() => {
                setActiveRightTab('history');
                setIsRightPanelCollapsed(false);
              }}
              className={`p-2 rounded-lg transition-all text-xs flex items-center justify-center ${
                activeRightTab === 'history'
                  ? 'text-cyan-400 bg-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title={`Open Catalog (${projects.length})`}
            >
              <History className="w-4 h-4" />
            </button>
          </aside>
        )}
      </div>
    </div>
  );
}
