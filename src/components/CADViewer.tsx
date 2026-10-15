import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Camera,
  Maximize2,
  Layers,
  Flame,
  Box,
  Eye,
  EyeOff,
  RotateCcw,
  Sparkles,
  Download,
  AlertTriangle,
  Compass,
  RotateCw,
  Move,
  CornerDownRight,
  Crosshair,
  RefreshCw,
  Info,
  Ruler,
  Check,
  Copy,
  X,
  Boxes,
  Plus,
  Trash2,
  Sliders,
  ChevronDown,
  ChevronUp,
  Grid,
  ShieldCheck,
  Play,
  Pause,
} from 'lucide-react';
import { GeometryData, ViewportSnapshot, MeshComponent, OverhangRegion } from '../types/cad';
import { generateOverhangColoredGeometry } from '../utils/geometryMath';
import {
  autoArrangeComponents,
  explodeComponents,
  mergeComponentGeometries,
  COMPONENT_PALETTE,
} from '../utils/fileLoader';

interface CADViewerProps {
  geometry: THREE.BufferGeometry | null;
  geometryData: GeometryData | null;
  filamentColor?: string;
  overhangThreshold?: number;
  onSnapshotsCaptured?: (snapshots: ViewportSnapshot[]) => void;
  isCapturing?: boolean;
  onGeometryTransformed?: (newGeometry: THREE.BufferGeometry, reason?: string) => void;
  isTransformed?: boolean;
  onResetTransformations?: () => void;
  // Multi-component 3D mesh assembly props
  components?: MeshComponent[];
  onComponentsChanged?: (components: MeshComponent[], updatedAssemblyGeo?: THREE.BufferGeometry) => void;
  onImportMoreFiles?: (files: File[]) => void;
  selectedComponentId?: string | null;
  onSelectComponent?: (id: string | null) => void;
  // Support-Free DfAM analysis props
  selectedRegion?: OverhangRegion | null;
  onSelectRegion?: (region: OverhangRegion | null) => void;
  onOpenDfAMHub?: () => void;
  onLoadSample?: (sampleId: string) => void;
  // Controlled shading & overhang heatmap props
  shadingMode?: ShadingMode;
  onShadingModeChange?: (mode: ShadingMode) => void;
}

export type ShadingMode = 'cad' | 'overhang' | 'xray';
export type InteractionMode = 'orbit' | 'rotate' | 'move' | 'measure';

export const CADViewer: React.FC<CADViewerProps> = ({
  geometry,
  geometryData,
  filamentColor = '#06b6d4',
  overhangThreshold = 45,
  onSnapshotsCaptured,
  isCapturing = false,
  onGeometryTransformed,
  isTransformed = false,
  onResetTransformations,
  components = [],
  onComponentsChanged,
  onImportMoreFiles,
  selectedComponentId: externalSelectedCompId,
  onSelectComponent: externalOnSelectComponent,
  selectedRegion,
  onSelectRegion,
  onOpenDfAMHub,
  onLoadSample,
  shadingMode: externalShadingMode,
  onShadingModeChange: externalOnShadingModeChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const assemblyGroupRef = useRef<THREE.Group | null>(null);
  const componentMeshesMapRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const boxHelperRef = useRef<THREE.BoxHelper | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const overhangMeshRef = useRef<THREE.Mesh | null>(null);
  const measureGroupRef = useRef<THREE.Group | null>(null);
  const regionHighlightRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());

  // Hidden file input for "+ Add Part" assembly importing
  const importMoreInputRef = useRef<HTMLInputElement>(null);

  const [internalShadingMode, setInternalShadingMode] = useState<ShadingMode>('cad');
  const shadingMode = externalShadingMode !== undefined ? externalShadingMode : internalShadingMode;
  const setShadingMode = useCallback(
    (mode: ShadingMode) => {
      if (externalOnShadingModeChange) {
        externalOnShadingModeChange(mode);
      }
      setInternalShadingMode(mode);
    },
    [externalOnShadingModeChange]
  );
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('orbit');
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [showBoundingBox, setShowBoundingBox] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [cameraView, setCameraView] = useState<'iso' | 'top' | 'front' | 'right'>('iso');
  const [internalCapturing, setInternalCapturing] = useState<boolean>(false);

  // Multi-Component Assembly Management State
  const [internalSelectedCompId, setInternalSelectedCompId] = useState<string | null>(null);
  const selectedCompId = externalSelectedCompId !== undefined ? externalSelectedCompId : internalSelectedCompId;
  const setSelectedCompId = (id: string | null) => {
    if (externalOnSelectComponent) {
      externalOnSelectComponent(id);
    }
    setInternalSelectedCompId(id);
  };

  const [showAssemblyPanel, setShowAssemblyPanel] = useState<boolean>(components.length > 1);
  const [explodeFactor, setExplodeFactor] = useState<number>(0);

  // Assembly Exploded View Animation State & Refs
  const [isExploding, setIsExploding] = useState<boolean>(false);
  const explodeAnimationRef = useRef<number | null>(null);
  const targetExplodeFactorRef = useRef<number>(0);
  const currentExplodeFactorRef = useRef<number>(0);
  const componentsRef = useRef<MeshComponent[]>(components);
  const [livePositions, setLivePositions] = useState<Record<string, [number, number, number]>>({});
  const lastThrottledUpdateRef = useRef<number>(0);
  const lastRenderConfigRef = useRef<{
    shadingMode: ShadingMode;
    wireframe: boolean;
    filamentColor: string;
    overhangThreshold: number;
  }>({
    shadingMode: 'cad',
    wireframe: false,
    filamentColor: '#06b6d4',
    overhangThreshold: 45,
  });

  // Sync componentsRef and update live dynamic positions map
  useEffect(() => {
    componentsRef.current = components;
    const initialPosMap: Record<string, [number, number, number]> = {};
    components.forEach((c) => {
      initialPosMap[c.id] = c.position;
    });
    setLivePositions(initialPosMap);
  }, [components]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (explodeAnimationRef.current) {
        cancelAnimationFrame(explodeAnimationRef.current);
      }
    };
  }, []);

  // Point-to-Point Measuring Tool State
  const [measurePointA, setMeasurePointA] = useState<THREE.Vector3 | null>(null);
  const [measurePointB, setMeasurePointB] = useState<THREE.Vector3 | null>(null);
  const [measureHoverPoint, setMeasureHoverPoint] = useState<THREE.Vector3 | null>(null);
  const [calloutPos, setCalloutPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [copiedMeasurement, setCopiedMeasurement] = useState<boolean>(false);

  // Measure tracking refs for smooth animation-loop screen projection
  const pointAStateRef = useRef<THREE.Vector3 | null>(null);
  const pointBStateRef = useRef<THREE.Vector3 | null>(null);
  const hoverPointStateRef = useRef<THREE.Vector3 | null>(null);

  // Mouse drag tracking for direct object manipulation
  const isDraggingMeshRef = useRef<boolean>(false);
  const dragStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Keep track of which component or mesh is actively being dragged
  const draggedComponentIdRef = useRef<string | null>(null);

  // Auto-expand assembly panel if multiple components are loaded
  useEffect(() => {
    if (components.length > 1) {
      setShowAssemblyPanel(true);
    }
  }, [components.length]);

  // Initialize Three.js scene with fixed Z-up ground plane
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    sceneRef.current = scene;

    // Assembly Group to hold multiple component meshes simultaneously
    const assemblyGroup = new THREE.Group();
    scene.add(assemblyGroup);
    assemblyGroupRef.current = assemblyGroup;

    // Measurement Visuals Group
    const measureGroup = new THREE.Group();
    scene.add(measureGroup);
    measureGroupRef.current = measureGroup;

    // Region Highlight Group for Support-Free DfAM
    const regionHighlightGroup = new THREE.Group();
    scene.add(regionHighlightGroup);
    regionHighlightRef.current = regionHighlightGroup;

    // Environment map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Camera - Set Z as TRUE UP axis so the grid stays horizontal and fixed
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.up.set(0, 0, 1);
    camera.position.set(130, -150, 110);
    cameraRef.current = camera;

    // Controls - Free 360° orbit in all directions
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI;
    controls.minPolarAngle = 0;
    controls.screenSpacePanning = true;
    controls.enablePan = true;
    controls.minDistance = 15;
    controls.maxDistance = 1200;
    controls.target.set(0, 0, 20);
    controls.update();
    controlsRef.current = controls;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight1.position.set(120, -160, 160);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x60a5fa, 0.9);
    dirLight2.position.set(-100, 140, 80);
    scene.add(dirLight2);

    const underLight = new THREE.DirectionalLight(0xf43f5e, 0.3);
    underLight.position.set(0, 0, -80);
    scene.add(underLight);

    // Fixed 3D Print Bed Grid (XY plane at Z = 0)
    const bedSize = 256;
    const grid = new THREE.GridHelper(bedSize, 25.6, 0x06b6d4, 0x1e293b);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(0, 0, 0);
    scene.add(grid);
    gridHelperRef.current = grid;

    // Bed corner frame outline (256 x 256 mm)
    const bedFrameShape = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-bedSize / 2, -bedSize / 2, 0),
      new THREE.Vector3(bedSize / 2, -bedSize / 2, 0),
      new THREE.Vector3(bedSize / 2, bedSize / 2, 0),
      new THREE.Vector3(-bedSize / 2, bedSize / 2, 0),
      new THREE.Vector3(-bedSize / 2, -bedSize / 2, 0),
    ]);
    const bedFrameLine = new THREE.Line(
      bedFrameShape,
      new THREE.LineBasicMaterial({ color: 0x334155, linewidth: 2 })
    );
    scene.add(bedFrameLine);

    // Origin XYZ coordinate axes indicator at bed corner
    const axesHelper = new THREE.AxesHelper(30);
    axesHelper.position.set(-bedSize / 2, -bedSize / 2, 0);
    scene.add(axesHelper);

    // Resize handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Animation Loop with live 3D screen projection for measurement callout
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (controls.enabled) {
        controls.update();
      }

      // Project measurement midpoint to screen coordinates for 2D callout tag
      const p1 = pointAStateRef.current;
      const p2 = pointBStateRef.current || hoverPointStateRef.current;

      if (p1 && p2 && cameraRef.current && containerRef.current) {
        const mid = p1.clone().lerp(p2, 0.5);
        mid.z += 1.5;
        const projected = mid.clone().project(cameraRef.current);

        if (projected.z < 1) {
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          const sx = (projected.x * 0.5 + 0.5) * w;
          const sy = (-(projected.y * 0.5) + 0.5) * h;
          setCalloutPos({ x: sx, y: sy, visible: true });
        } else {
          setCalloutPos({ x: 0, y: 0, visible: false });
        }
      } else {
        setCalloutPos(null);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Sync controls enabled state and mouse buttons with interaction mode
  useEffect(() => {
    if (controlsRef.current) {
      if (interactionMode === 'measure') {
        controlsRef.current.mouseButtons = {
          LEFT: -1 as any,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        };
        controlsRef.current.enabled = true;
      } else if (interactionMode === 'orbit') {
        controlsRef.current.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
        controlsRef.current.enabled = true;
      } else {
        controlsRef.current.enabled = false;
      }
    }
  }, [interactionMode]);

  // -------------------------------------------------------------------------
  // MESH RENDERING: SUPPORTS BOTH MULTI-COMPONENT ASSEMBLIES & SINGLE MESH
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // If an explosion animation is actively driving the mesh transforms, skip full rebuild
    if (isExploding) {
      return;
    }

    // SCENARIO A-OPTIMIZED: If assembly meshes already exist and only positions/rotations/visibility changed
    const canUpdateInPlace =
      components &&
      components.length > 0 &&
      componentMeshesMapRef.current.size === components.length &&
      components.every((comp) => componentMeshesMapRef.current.has(comp.id)) &&
      lastRenderConfigRef.current.shadingMode === shadingMode &&
      lastRenderConfigRef.current.wireframe === wireframe &&
      lastRenderConfigRef.current.filamentColor === filamentColor &&
      lastRenderConfigRef.current.overhangThreshold === overhangThreshold;

    if (canUpdateInPlace) {
      components.forEach((comp) => {
        const cMesh = componentMeshesMapRef.current.get(comp.id);
        if (cMesh) {
          cMesh.position.set(comp.position[0], comp.position[1], comp.position[2]);
          cMesh.rotation.set(comp.rotation[0], comp.rotation[1], comp.rotation[2]);
          cMesh.scale.set(comp.scale[0], comp.scale[1], comp.scale[2]);
          cMesh.visible = comp.visible !== false;
        }
      });
      if (boxHelperRef.current) {
        boxHelperRef.current.update();
      }
      return;
    }

    lastRenderConfigRef.current = {
      shadingMode,
      wireframe,
      filamentColor,
      overhangThreshold,
    };

    // Clean up single mesh if present
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach((m) => m.dispose());
      } else {
        meshRef.current.material.dispose();
      }
      meshRef.current = null;
    }

    if (overhangMeshRef.current) {
      scene.remove(overhangMeshRef.current);
      overhangMeshRef.current.geometry.dispose();
      if (Array.isArray(overhangMeshRef.current.material)) {
        overhangMeshRef.current.material.forEach((m) => m.dispose());
      } else {
        overhangMeshRef.current.material.dispose();
      }
      overhangMeshRef.current = null;
    }

    // Clean up assembly group children
    if (assemblyGroupRef.current) {
      const group = assemblyGroupRef.current;
      while (group.children.length > 0) {
        const obj = group.children[0] as THREE.Mesh;
        group.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      }
      componentMeshesMapRef.current.clear();
    }

    // Clean up bounding box helper
    if (boxHelperRef.current) {
      scene.remove(boxHelperRef.current);
      boxHelperRef.current.dispose();
      boxHelperRef.current = null;
    }

    // SCENARIO A: MULTI-COMPONENT ASSEMBLY (components array has items)
    if (components && components.length > 0 && assemblyGroupRef.current) {
      const group = assemblyGroupRef.current;

      components.forEach((comp, idx) => {
        if (!comp.geometry) return;

        let mat: THREE.Material;
        const compColor = comp.color || COMPONENT_PALETTE[idx % COMPONENT_PALETTE.length] || filamentColor;

        if (shadingMode === 'overhang') {
          const coloredGeo = generateOverhangColoredGeometry(comp.geometry, overhangThreshold, 'Z');
          mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.35,
            metalness: 0.1,
            wireframe: wireframe,
          });
          const cMesh = new THREE.Mesh(coloredGeo, mat);
          cMesh.name = comp.id;
          cMesh.position.set(comp.position[0], comp.position[1], comp.position[2]);
          cMesh.rotation.set(comp.rotation[0], comp.rotation[1], comp.rotation[2]);
          cMesh.scale.set(comp.scale[0], comp.scale[1], comp.scale[2]);
          cMesh.visible = comp.visible !== false;
          cMesh.castShadow = true;
          cMesh.receiveShadow = true;
          group.add(cMesh);
          componentMeshesMapRef.current.set(comp.id, cMesh);
        } else if (shadingMode === 'xray') {
          mat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(compColor),
            transparent: true,
            opacity: 0.42,
            transmission: 0.65,
            roughness: 0.1,
            metalness: 0.1,
            wireframe: wireframe,
            depthWrite: false,
          });
          const cMesh = new THREE.Mesh(comp.geometry, mat);
          cMesh.name = comp.id;
          cMesh.position.set(comp.position[0], comp.position[1], comp.position[2]);
          cMesh.rotation.set(comp.rotation[0], comp.rotation[1], comp.rotation[2]);
          cMesh.scale.set(comp.scale[0], comp.scale[1], comp.scale[2]);
          cMesh.visible = comp.visible !== false;
          cMesh.castShadow = false;
          group.add(cMesh);
          componentMeshesMapRef.current.set(comp.id, cMesh);
        } else {
          // Standard Technical CAD PBR Polymer with component-specific color
          mat = new THREE.MeshPhysicalMaterial({
            color: new THREE.Color(compColor),
            roughness: 0.32,
            metalness: 0.15,
            clearcoat: 0.25,
            clearcoatRoughness: 0.2,
            wireframe: wireframe,
          });
          const cMesh = new THREE.Mesh(comp.geometry, mat);
          cMesh.name = comp.id;
          cMesh.position.set(comp.position[0], comp.position[1], comp.position[2]);
          cMesh.rotation.set(comp.rotation[0], comp.rotation[1], comp.rotation[2]);
          cMesh.scale.set(comp.scale[0], comp.scale[1], comp.scale[2]);
          cMesh.visible = comp.visible !== false;
          cMesh.castShadow = true;
          cMesh.receiveShadow = true;
          group.add(cMesh);
          componentMeshesMapRef.current.set(comp.id, cMesh);
        }
      });

      // Add Bounding Box Helper: Wraps either the selected component or the entire assembly
      if (showBoundingBox) {
        let targetForBox: THREE.Object3D | null = null;
        if (selectedCompId && componentMeshesMapRef.current.has(selectedCompId)) {
          targetForBox = componentMeshesMapRef.current.get(selectedCompId) || null;
        } else if (group.children.length > 0) {
          targetForBox = group;
        }

        if (targetForBox) {
          const box = new THREE.BoxHelper(targetForBox, selectedCompId ? 0xf59e0b : 0x06b6d4);
          (box.material as THREE.LineBasicMaterial).transparent = true;
          (box.material as THREE.LineBasicMaterial).opacity = 0.75;
          scene.add(box);
          boxHelperRef.current = box;
        }
      }

      // Center camera on assembly
      if (geometry && controlsRef.current && cameraRef.current) {
        geometry.computeBoundingBox();
        if (geometry.boundingBox) {
          const center = new THREE.Vector3();
          geometry.boundingBox.getCenter(center);
          controlsRef.current.target.set(center.x, center.y, center.z);
          controlsRef.current.update();
        }
      }
      return;
    }

    // SCENARIO B: SINGLE MESH FALLBACK (when components is empty)
    if (!geometry) return;

    let material: THREE.Material;

    if (shadingMode === 'overhang') {
      const coloredGeo = generateOverhangColoredGeometry(geometry, overhangThreshold, 'Z');
      material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.35,
        metalness: 0.1,
        wireframe: wireframe,
      });
      const mesh = new THREE.Mesh(coloredGeo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      overhangMeshRef.current = mesh;
    } else if (shadingMode === 'xray') {
      material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(filamentColor),
        transparent: true,
        opacity: 0.38,
        transmission: 0.65,
        roughness: 0.1,
        metalness: 0.1,
        wireframe: wireframe,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = false;
      scene.add(mesh);
      meshRef.current = mesh;
    } else {
      material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(filamentColor),
        roughness: 0.32,
        metalness: 0.15,
        clearcoat: 0.25,
        clearcoatRoughness: 0.2,
        wireframe: wireframe,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      meshRef.current = mesh;
    }

    // Add Bounding Box Helper
    const activeMesh = overhangMeshRef.current || meshRef.current;
    if (activeMesh && showBoundingBox) {
      const box = new THREE.BoxHelper(activeMesh, 0x06b6d4);
      (box.material as THREE.LineBasicMaterial).transparent = true;
      (box.material as THREE.LineBasicMaterial).opacity = 0.65;
      scene.add(box);
      boxHelperRef.current = box;
    }

    // Focus controls on model center
    geometry.computeBoundingBox();
    if (geometry.boundingBox && controlsRef.current && cameraRef.current) {
      const center = new THREE.Vector3();
      geometry.boundingBox.getCenter(center);
      controlsRef.current.target.set(center.x, center.y, center.z);
      controlsRef.current.update();
    }
  }, [
    geometry,
    components,
    selectedCompId,
    shadingMode,
    wireframe,
    showBoundingBox,
    filamentColor,
    overhangThreshold,
  ]);

  // Toggle Grid
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Highlight selected overhang region in 3D scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !regionHighlightRef.current) return;

    const group = regionHighlightRef.current;
    while (group.children.length > 0) {
      const obj = group.children[0] as any;
      group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m: any) => m.dispose());
        else obj.material.dispose();
      }
    }

    if (selectedRegion) {
      const { centroid, boundingBox } = selectedRegion;
      const sx = Math.max(3, boundingBox.size[0] + 2);
      const sy = Math.max(3, boundingBox.size[1] + 2);
      const sz = Math.max(3, boundingBox.size[2] + 2);

      const boxGeo = new THREE.BoxGeometry(sx, sy, sz);
      const edges = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();

      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color('#f59e0b'), // bright amber
        linewidth: 2,
      });
      const wireBox = new THREE.LineSegments(edges, lineMat);
      wireBox.position.set(centroid[0], centroid[1], centroid[2]);
      group.add(wireBox);

      // Centroid glowing beacon
      const sphereGeo = new THREE.SphereGeometry(1.8, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color('#ef4444'),
        wireframe: true,
      });
      const beacon = new THREE.Mesh(sphereGeo, sphereMat);
      beacon.position.set(centroid[0], centroid[1], centroid[2]);
      group.add(beacon);

      // Smoothly pan camera target toward region centroid
      if (controlsRef.current) {
        controlsRef.current.target.set(centroid[0], centroid[1], centroid[2]);
        controlsRef.current.update();
      }

      // Automatically switch to overhang heatmap mode to see critical overhang faces
      setShadingMode('overhang');
    }
  }, [selectedRegion]);

  // -------------------------------------------------------------------------
  // 3D POINT-TO-POINT MEASUREMENT VISUAL RENDERING (RAYCASTER)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!measureGroupRef.current) return;
    const group = measureGroupRef.current;
    group.clear();

    if (interactionMode !== 'measure' && !measurePointB) return;

    const sphereGeo = new THREE.SphereGeometry(1.4, 20, 20);
    const pointAMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });
    const pointBMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const hoverMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.75,
    });

    if (measurePointA) {
      const meshA = new THREE.Mesh(sphereGeo, pointAMat);
      meshA.position.copy(measurePointA);
      group.add(meshA);

      const ringGeo = new THREE.RingGeometry(2.5, 3.2, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const ringA = new THREE.Mesh(ringGeo, ringMat);
      ringA.position.copy(measurePointA);
      ringA.lookAt(
        cameraRef.current ? cameraRef.current.position : new THREE.Vector3(0, 0, 100)
      );
      group.add(ringA);
    }

    if (measurePointB) {
      const meshB = new THREE.Mesh(sphereGeo, pointBMat);
      meshB.position.copy(measurePointB);
      group.add(meshB);

      const ringGeo = new THREE.RingGeometry(2.5, 3.2, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });
      const ringB = new THREE.Mesh(ringGeo, ringMat);
      ringB.position.copy(measurePointB);
      ringB.lookAt(
        cameraRef.current ? cameraRef.current.position : new THREE.Vector3(0, 0, 100)
      );
      group.add(ringB);
    } else if (measureHoverPoint && measurePointA) {
      const meshHover = new THREE.Mesh(sphereGeo, hoverMat);
      meshHover.position.copy(measureHoverPoint);
      group.add(meshHover);
    }

    const p1 = measurePointA;
    const p2 = measurePointB || (measurePointA ? measureHoverPoint : null);

    if (p1 && p2) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineBasicMaterial({
        color: measurePointB ? 0x22d3ee : 0xf59e0b,
        linewidth: 2,
        transparent: true,
        opacity: 0.9,
      });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);

      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      const dz = Math.abs(p2.z - p1.z);

      if (dx > 3 || dy > 3 || dz > 3) {
        const deltaPts = [
          p1,
          new THREE.Vector3(p2.x, p1.y, p1.z),
          new THREE.Vector3(p2.x, p2.y, p1.z),
          p2,
        ];
        const deltaGeo = new THREE.BufferGeometry().setFromPoints(deltaPts);
        const deltaMat = new THREE.LineDashedMaterial({
          color: 0x64748b,
          dashSize: 2,
          gapSize: 1.5,
          transparent: true,
          opacity: 0.6,
        });
        const deltaLine = new THREE.Line(deltaGeo, deltaMat);
        deltaLine.computeLineDistances();
        group.add(deltaLine);
      }
    }
  }, [measurePointA, measurePointB, measureHoverPoint, interactionMode]);

  // Clear measurement points
  const clearMeasurement = useCallback(() => {
    setMeasurePointA(null);
    setMeasurePointB(null);
    setMeasureHoverPoint(null);
    pointAStateRef.current = null;
    pointBStateRef.current = null;
    hoverPointStateRef.current = null;
    setCalloutPos(null);
    if (measureGroupRef.current) {
      measureGroupRef.current.clear();
    }
  }, []);

  // Measured Distance & Delta Coordinates
  const activeDistance =
    measurePointA && measurePointB
      ? measurePointA.distanceTo(measurePointB)
      : measurePointA && measureHoverPoint
      ? measurePointA.distanceTo(measureHoverPoint)
      : null;

  const deltaCoords =
    measurePointA && (measurePointB || measureHoverPoint)
      ? {
          dx: Math.abs((measurePointB || measureHoverPoint)!.x - measurePointA.x),
          dy: Math.abs((measurePointB || measureHoverPoint)!.y - measurePointA.y),
          dz: Math.abs((measurePointB || measureHoverPoint)!.z - measurePointA.z),
        }
      : null;

  // Helper: Collect all currently pickable 3D meshes in the viewport
  const getPickableMeshes = useCallback((): THREE.Object3D[] => {
    const list: THREE.Object3D[] = [];
    if (assemblyGroupRef.current && assemblyGroupRef.current.children.length > 0) {
      assemblyGroupRef.current.children.forEach((c) => {
        if (c.visible) list.push(c);
      });
    } else {
      const active = overhangMeshRef.current || meshRef.current;
      if (active && active.visible) list.push(active);
    }
    return list;
  }, []);

  // Camera presets that orbit around fixed Z-up axis
  const setView = useCallback(
    (view: 'iso' | 'top' | 'front' | 'right') => {
      if (!cameraRef.current || !controlsRef.current || !geometry) return;
      geometry.computeBoundingBox();
      const center = new THREE.Vector3();
      geometry.boundingBox?.getCenter(center);
      const size = new THREE.Vector3();
      geometry.boundingBox?.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 50);
      const dist = maxDim * 2.2;

      setCameraView(view);
      controlsRef.current.target.copy(center);

      if (view === 'iso') {
        cameraRef.current.position.set(
          center.x + dist * 0.7,
          center.y - dist * 0.7,
          center.z + dist * 0.65
        );
      } else if (view === 'top') {
        cameraRef.current.position.set(center.x, center.y - 0.001, center.z + dist * 1.5);
      } else if (view === 'front') {
        cameraRef.current.position.set(center.x, center.y - dist * 1.5, center.z + dist * 0.15);
      } else if (view === 'right') {
        cameraRef.current.position.set(center.x + dist * 1.5, center.y, center.z + dist * 0.15);
      }

      controlsRef.current.update();
    },
    [geometry]
  );

  // -------------------------------------------------------------------------
  // TRANSFORM OBJECT & COMPONENTS (GRID STAYS 100% FIXED)
  // -------------------------------------------------------------------------
  const rotateObject = useCallback(
    (axis: 'x' | 'y' | 'z', angleDeg: number) => {
      const rad = THREE.MathUtils.degToRad(angleDeg);

      // If a specific component in an assembly is selected, rotate only that component!
      if (selectedCompId && components.length > 0 && onComponentsChanged) {
        const updated = components.map((c) => {
          if (c.id !== selectedCompId) return c;
          const cloned = c.geometry.clone();
          if (axis === 'x') cloned.rotateX(rad);
          if (axis === 'y') cloned.rotateY(rad);
          if (axis === 'z') cloned.rotateZ(rad);
          cloned.computeVertexNormals();
          return {
            ...c,
            geometry: cloned,
            isTransformed: true,
          };
        });
        const composite = mergeComponentGeometries(updated);
        onComponentsChanged(updated, composite);
        return;
      }

      // Otherwise rotate the entire active geometry / assembly
      if (!geometry || !onGeometryTransformed) return;
      const cloned = geometry.clone();

      if (axis === 'x') cloned.rotateX(rad);
      if (axis === 'y') cloned.rotateY(rad);
      if (axis === 'z') cloned.rotateZ(rad);

      cloned.computeBoundingBox();
      if (cloned.boundingBox) {
        const minZ = cloned.boundingBox.min.z;
        cloned.translate(0, 0, -minZ);
      }
      cloned.computeVertexNormals();

      onGeometryTransformed(
        cloned,
        `Rotated ${angleDeg > 0 ? '+' : ''}${angleDeg}° around ${axis.toUpperCase()}-axis`
      );
    },
    [geometry, selectedCompId, components, onComponentsChanged, onGeometryTransformed]
  );

  // Center object on build plate (X=0, Y=0, Z bottom=0)
  const centerObjectOnBed = useCallback(() => {
    if (selectedCompId && components.length > 0 && onComponentsChanged) {
      const updated = components.map((c) => {
        if (c.id !== selectedCompId) return c;
        return {
          ...c,
          position: [0, 0, 0] as [number, number, number],
        };
      });
      const composite = mergeComponentGeometries(updated);
      onComponentsChanged(updated, composite);
      return;
    }

    if (!geometry || !onGeometryTransformed) return;
    const cloned = geometry.clone();
    cloned.computeBoundingBox();
    if (!cloned.boundingBox) return;

    const center = new THREE.Vector3();
    cloned.boundingBox.getCenter(center);
    const minZ = cloned.boundingBox.min.z;

    cloned.translate(-center.x, -center.y, -minZ);
    cloned.computeBoundingBox();
    cloned.computeVertexNormals();

    onGeometryTransformed(cloned, 'Centered model at build plate origin (0, 0, 0)');
  }, [geometry, selectedCompId, components, onComponentsChanged, onGeometryTransformed]);

  // Ground bottom surface at Z=0
  const groundObjectOnBed = useCallback(() => {
    if (!geometry || !onGeometryTransformed) return;
    const cloned = geometry.clone();
    cloned.computeBoundingBox();
    if (!cloned.boundingBox) return;

    const minZ = cloned.boundingBox.min.z;
    cloned.translate(0, 0, -minZ);
    cloned.computeBoundingBox();
    cloned.computeVertexNormals();

    onGeometryTransformed(cloned, 'Grounded model flat on build plate at Z = 0');
  }, [geometry, onGeometryTransformed]);

  // Nudge selected component along axis
  const nudgeComponent = (axis: 'x' | 'y' | 'z', delta: number) => {
    if (!selectedCompId || components.length === 0 || !onComponentsChanged) return;
    const updated = components.map((c) => {
      if (c.id !== selectedCompId) return c;
      const pos: [number, number, number] = [...c.position];
      if (axis === 'x') pos[0] += delta;
      if (axis === 'y') pos[1] += delta;
      if (axis === 'z') pos[2] += delta;
      return {
        ...c,
        position: pos,
        isTransformed: true,
      };
    });
    const composite = mergeComponentGeometries(updated);
    onComponentsChanged(updated, composite);
  };

  // Toggle component visibility
  const toggleComponentVisibility = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (components.length === 0 || !onComponentsChanged) return;
    const updated = components.map((c) => {
      if (c.id !== id) return c;
      return {
        ...c,
        visible: !c.visible,
      };
    });
    const composite = mergeComponentGeometries(updated);
    onComponentsChanged(updated, composite);
  };

  // Remove component from assembly
  const removeComponent = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (components.length <= 1 || !onComponentsChanged) return;
    const updated = components.filter((c) => c.id !== id);
    if (selectedCompId === id) {
      setSelectedCompId(null);
    }
    const composite = mergeComponentGeometries(updated);
    onComponentsChanged(updated, composite);
  };

  // Auto-arrange all components on the print bed
  const handleAutoArrange = () => {
    if (components.length <= 1 || !onComponentsChanged) return;
    const arranged = autoArrangeComponents(components);
    setExplodeFactor(0);
    const composite = mergeComponentGeometries(arranged);
    onComponentsChanged(arranged, composite);
  };

  // Explode assembly slider / manual scrub
  const handleExplodeChange = (factor: number) => {
    if (explodeAnimationRef.current) {
      cancelAnimationFrame(explodeAnimationRef.current);
      explodeAnimationRef.current = null;
      setIsExploding(false);
    }
    setExplodeFactor(factor);
    currentExplodeFactorRef.current = factor;
    if (components.length <= 1 || !onComponentsChanged) return;
    const exploded = explodeComponents(components, factor);

    // Update Three.js meshes directly
    exploded.forEach((comp) => {
      const mesh = componentMeshesMapRef.current.get(comp.id);
      if (mesh) {
        mesh.position.set(comp.position[0], comp.position[1], comp.position[2]);
      }
    });
    if (boxHelperRef.current) boxHelperRef.current.update();

    const livePosMap: Record<string, [number, number, number]> = {};
    exploded.forEach((c) => {
      livePosMap[c.id] = c.position;
    });
    setLivePositions(livePosMap);

    const composite = mergeComponentGeometries(exploded);
    onComponentsChanged(exploded, composite);
  };

  // Assembly Exploded View 60fps Smooth Mechanical Animation Loop
  const startExplodeAnimation = useCallback(
    (targetFactor: number, compsToExplode?: MeshComponent[]) => {
      if (explodeAnimationRef.current) {
        cancelAnimationFrame(explodeAnimationRef.current);
        explodeAnimationRef.current = null;
      }

      const activeComps = compsToExplode || componentsRef.current;
      if (activeComps.length <= 1) return;

      setIsExploding(true);
      targetExplodeFactorRef.current = targetFactor;

      const startFactor = currentExplodeFactorRef.current;
      const startTime = performance.now();
      const duration = 850; // ms

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);

        // Smooth cubic ease-in-out curve
        const ease =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        const currentFactor = startFactor + (targetFactor - startFactor) * ease;
        currentExplodeFactorRef.current = currentFactor;
        setExplodeFactor(currentFactor);

        // Compute new positions dynamically
        const currentComps = componentsRef.current.length > 0 ? componentsRef.current : activeComps;
        const exploded = explodeComponents(currentComps, currentFactor);

        // 1. Update 3D scene meshes directly at 60fps
        exploded.forEach((comp) => {
          const mesh = componentMeshesMapRef.current.get(comp.id);
          if (mesh) {
            mesh.position.set(comp.position[0], comp.position[1], comp.position[2]);
          }
        });
        if (boxHelperRef.current) {
          boxHelperRef.current.update();
        }

        // 2. Update live position telemetry map dynamically for component badges
        const livePosMap: Record<string, [number, number, number]> = {};
        exploded.forEach((c) => {
          livePosMap[c.id] = c.position;
        });
        setLivePositions(livePosMap);

        // 3. Dynamically update parent component positions state (throttled ~60ms so state is reactive without choking React)
        if (now - lastThrottledUpdateRef.current > 60 && onComponentsChanged) {
          lastThrottledUpdateRef.current = now;
          onComponentsChanged(exploded);
        }

        if (progress < 1) {
          explodeAnimationRef.current = requestAnimationFrame(animate);
        } else {
          setIsExploding(false);
          explodeAnimationRef.current = null;
          // Final state commit with merged composite geometry
          if (onComponentsChanged) {
            const composite = mergeComponentGeometries(exploded);
            onComponentsChanged(exploded, composite);
          }
        }
      };

      explodeAnimationRef.current = requestAnimationFrame(animate);
    },
    [onComponentsChanged]
  );

  // Toggle Exploded View Animation button click handler
  const toggleExplodedViewAnimation = useCallback(() => {
    // If only single component loaded and demo loader is available, load the 3-piece modular clamp assembly
    if (components.length <= 1) {
      if (onLoadSample) {
        onLoadSample('modular_clamp_assembly');
        setShowAssemblyPanel(true);
        setTimeout(() => {
          startExplodeAnimation(0.85);
        }, 300);
      }
      return;
    }

    // Toggle: if currently exploded (> 0.05), animate back to 0; otherwise explode to 0.85
    const target = explodeFactor > 0.05 ? 0 : 0.85;
    startExplodeAnimation(target);
  }, [components.length, explodeFactor, onLoadSample, startExplodeAnimation]);

  // -------------------------------------------------------------------------
  // MOUSE & POINTER HANDLERS: MEASURING & DIRECT VIEWPORT DRAGGING
  // -------------------------------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current || !cameraRef.current) return;

    // MEASURE MODE: Drop Point A or Point B
    if (interactionMode === 'measure') {
      if (e.button === 2) return; // Right-click allows orbiting in measure mode

      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const pickables = getPickableMeshes();
      const intersects = raycasterRef.current.intersectObjects(pickables, true);

      if (intersects.length > 0) {
        const hit = intersects[0].point.clone();
        if (!measurePointA) {
          setMeasurePointA(hit);
          pointAStateRef.current = hit;
          setMeasurePointB(null);
          pointBStateRef.current = null;
        } else if (!measurePointB) {
          setMeasurePointB(hit);
          pointBStateRef.current = hit;
        } else {
          setMeasurePointA(hit);
          pointAStateRef.current = hit;
          setMeasurePointB(null);
          pointBStateRef.current = null;
        }
      }
      return;
    }

    // ORBIT MODE: Component selection by clicking in viewport
    if (interactionMode === 'orbit') {
      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const pickables = getPickableMeshes();
      const intersects = raycasterRef.current.intersectObjects(pickables, true);

      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        if (hitMesh && hitMesh.name && components.some((c) => c.id === hitMesh.name)) {
          setSelectedCompId(hitMesh.name);
        }
      } else {
        // Clicked empty background
        setSelectedCompId(null);
      }
      return;
    }

    // ROTATE or MOVE MODES: Direct mesh manipulation
    isDraggingMeshRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    draggedComponentIdRef.current = selectedCompId;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // 1. Point-to-Point surface Raycaster hover
    if (interactionMode === 'measure' && containerRef.current && cameraRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycasterRef.current.setFromCamera(mouse, cameraRef.current);
      const pickables = getPickableMeshes();
      const intersects = raycasterRef.current.intersectObjects(pickables, true);

      if (intersects.length > 0) {
        const hit = intersects[0].point.clone();
        setMeasureHoverPoint(hit);
        hoverPointStateRef.current = hit;
      } else {
        setMeasureHoverPoint(null);
        hoverPointStateRef.current = null;
      }
      return;
    }

    if (!isDraggingMeshRef.current || interactionMode === 'orbit') return;

    const deltaX = e.clientX - dragStartPosRef.current.x;
    const deltaY = e.clientY - dragStartPosRef.current.y;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };

    // Identify active target mesh
    let activeMesh: THREE.Object3D | null = null;
    if (selectedCompId && componentMeshesMapRef.current.has(selectedCompId)) {
      activeMesh = componentMeshesMapRef.current.get(selectedCompId) || null;
    } else if (assemblyGroupRef.current && assemblyGroupRef.current.children.length > 0) {
      activeMesh = assemblyGroupRef.current;
    } else {
      activeMesh = overhangMeshRef.current || meshRef.current;
    }

    if (!activeMesh || !cameraRef.current) return;

    const camera = cameraRef.current;
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    if (interactionMode === 'rotate') {
      const rotX = new THREE.Quaternion().setFromAxisAngle(camUp, deltaX * 0.015);
      const rotY = new THREE.Quaternion().setFromAxisAngle(camRight, deltaY * 0.015);
      activeMesh.quaternion.premultiply(rotX).premultiply(rotY);
    } else if (interactionMode === 'move') {
      if (e.shiftKey) {
        const camForward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
        activeMesh.position.addScaledVector(camForward, -deltaY * 0.35);
      } else {
        activeMesh.position.addScaledVector(camRight, deltaX * 0.35);
        activeMesh.position.addScaledVector(camUp, -deltaY * 0.35);
      }
    }
  };

  const handlePointerUp = () => {
    if (!isDraggingMeshRef.current) return;
    isDraggingMeshRef.current = false;

    // SCENARIO 1: Component was dragged/rotated in assembly
    if (selectedCompId && components.length > 0 && onComponentsChanged) {
      const mesh = componentMeshesMapRef.current.get(selectedCompId);
      if (mesh) {
        const updated = components.map((c) => {
          if (c.id !== selectedCompId) return c;
          return {
            ...c,
            position: [mesh.position.x, mesh.position.y, mesh.position.z] as [number, number, number],
            rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z] as [number, number, number],
            isTransformed: true,
          };
        });
        const composite = mergeComponentGeometries(updated);
        onComponentsChanged(updated, composite);
      }
      return;
    }

    // SCENARIO 2: Single geometry was transformed
    if (!geometry || !onGeometryTransformed) return;
    const activeMesh = overhangMeshRef.current || meshRef.current;
    if (!activeMesh) return;

    const cloned = geometry.clone();
    activeMesh.updateMatrix();
    cloned.applyMatrix4(activeMesh.matrix);

    activeMesh.position.set(0, 0, 0);
    activeMesh.quaternion.identity();
    activeMesh.rotation.set(0, 0, 0);
    activeMesh.scale.set(1, 1, 1);
    activeMesh.updateMatrix();

    cloned.computeBoundingBox();
    cloned.computeVertexNormals();
    onGeometryTransformed(
      cloned,
      interactionMode === 'rotate' ? 'Interactive 3D viewport rotation' : 'Interactive 3D viewport translation'
    );
  };

  // Capture Viewport Renders for Gemini multimodal analysis and ZIP export
  const captureViewportRenders = useCallback(async () => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !controlsRef.current || !geometry) {
      return;
    }

    setInternalCapturing(true);

    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox?.getCenter(center);
    const size = new THREE.Vector3();
    geometry.boundingBox?.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 50);
    const dist = maxDim * 2.2;

    controls.target.copy(center);

    const originalShading = shadingMode;
    const originalPos = camera.position.clone();
    const originalTarget = controls.target.clone();

    const snapshots: ViewportSnapshot[] = [];

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    try {
      // 1. Isometric Render (CAD Material)
      setShadingMode('cad');
      camera.position.set(center.x + dist * 0.7, center.y - dist * 0.7, center.z + dist * 0.65);
      controls.update();
      await sleep(70);
      renderer.render(scene, camera);
      snapshots.push({
        viewName: 'render_iso',
        label: 'Isometric View (3D Angle)',
        dataUrl: renderer.domElement.toDataURL('image/png'),
      });

      // 2. Top View (Build Plate Z-Down)
      camera.position.set(center.x, center.y - 0.001, center.z + dist * 1.5);
      controls.update();
      await sleep(70);
      renderer.render(scene, camera);
      snapshots.push({
        viewName: 'render_top',
        label: 'Top Projection (Build Plate Alignment)',
        dataUrl: renderer.domElement.toDataURL('image/png'),
      });

      // 3. Front Elevation View
      camera.position.set(center.x, center.y - dist * 1.5, center.z + dist * 0.15);
      controls.update();
      await sleep(70);
      renderer.render(scene, camera);
      snapshots.push({
        viewName: 'render_front',
        label: 'Front Elevation (Layer Stacking View)',
        dataUrl: renderer.domElement.toDataURL('image/png'),
      });

      // 4. Overhang Analysis Heatmap View
      setShadingMode('overhang');
      camera.position.set(center.x + dist * 0.6, center.y - dist * 0.6, center.z + dist * 0.25);
      controls.update();
      await sleep(90);
      renderer.render(scene, camera);
      snapshots.push({
        viewName: 'render_overhang',
        label: 'Overhang Angle Heatmap (>45° Critical Support Zones)',
        dataUrl: renderer.domElement.toDataURL('image/png'),
      });

      // Restore original
      setShadingMode(originalShading);
      camera.position.copy(originalPos);
      controls.target.copy(originalTarget);
      controls.update();
      renderer.render(scene, camera);

      if (onSnapshotsCaptured) {
        onSnapshotsCaptured(snapshots);
      }
    } catch (err) {
      console.error('Failed capturing snapshots:', err);
    } finally {
      setInternalCapturing(false);
    }
  }, [geometry, shadingMode, onSnapshotsCaptured]);

  // Selected component object for HUD
  const selectedComponent = components.find((c) => c.id === selectedCompId);

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-950 overflow-hidden select-none">
      {/* Hidden File Input for Adding/Importing More Parts into Assembly */}
      <input
        ref={importMoreInputRef}
        type="file"
        multiple
        accept=".stl,.3mf,.step,.stp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0 && onImportMoreFiles) {
            onImportMoreFiles(Array.from(e.target.files));
          }
          e.target.value = '';
        }}
      />

      {/* 3D WebGL Canvas Container */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className={`w-full h-full relative ${
          interactionMode === 'measure'
            ? 'cursor-crosshair'
            : interactionMode === 'orbit'
            ? 'cursor-grab active:cursor-grabbing'
            : interactionMode === 'rotate'
            ? 'cursor-crosshair'
            : 'cursor-move'
        }`}
      />

      {/* Dynamic 2D Callout Tag pinned directly to the 3D dimension line midpoint */}
      {calloutPos && calloutPos.visible && activeDistance !== null && (
        <div
          className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 z-30 transition-transform duration-75"
          style={{ left: `${calloutPos.x}px`, top: `${calloutPos.y}px` }}
        >
          <div className="flex flex-col items-center">
            <div className="px-3 py-1.5 bg-slate-900/95 backdrop-blur-md border border-cyan-400/50 rounded-xl shadow-2xl flex flex-col items-center gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-mono font-black text-cyan-300">
                  {activeDistance.toFixed(2)} mm
                </span>
                <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  {measurePointB ? 'Locked' : 'Live'}
                </span>
              </div>
              {deltaCoords && (
                <div className="text-[9px] font-mono text-slate-400 flex items-center gap-1.5">
                  <span>ΔX: {deltaCoords.dx.toFixed(1)}</span>
                  <span>•</span>
                  <span>ΔY: {deltaCoords.dy.toFixed(1)}</span>
                  <span>•</span>
                  <span>ΔZ: {deltaCoords.dz.toFixed(1)} mm</span>
                </div>
              )}
            </div>
            <div className="w-2 h-2 bg-slate-900 border-r border-b border-cyan-400/50 transform rotate-45 -mt-1" />
          </div>
        </div>
      )}

      {/* Top Floating View Controls & Presets */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        {/* Left: Camera Presets & Interaction Mode Switch */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg shadow-xl pointer-events-auto">
          {/* Orbit View */}
          <button
            onClick={() => {
              setInteractionMode('orbit');
              clearMeasurement();
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              interactionMode === 'orbit'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Orbit Camera View (Click to select parts; Drag mouse to orbit around fixed grid)"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Orbit</span>
          </button>

          {/* Rotate Object */}
          <button
            onClick={() => {
              setInteractionMode('rotate');
              clearMeasurement();
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              interactionMode === 'rotate'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Rotate Component or Assembly in 3D"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Rotate</span>
          </button>

          {/* Move Object */}
          <button
            onClick={() => {
              setInteractionMode('move');
              clearMeasurement();
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              interactionMode === 'move'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Move Component or Assembly in 3D"
          >
            <Move className="w-3.5 h-3.5" />
            <span>Move</span>
          </button>

          {/* Point-to-Point Measuring Tool */}
          <button
            onClick={() => {
              const next = interactionMode === 'measure' ? 'orbit' : 'measure';
              setInteractionMode(next);
              if (next !== 'measure') {
                clearMeasurement();
              }
            }}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              interactionMode === 'measure'
                ? 'bg-cyan-500 text-slate-950 font-semibold shadow'
                : 'text-slate-400 hover:text-cyan-400'
            }`}
            title="Measure Distances & Clearances Across Model Surfaces"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Measure</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-800 mx-1" />

          {/* Camera Presets */}
          <button
            onClick={() => setView('iso')}
            className={`px-2 py-1 text-xs font-mono font-medium rounded transition-colors ${
              cameraView === 'iso'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Isometric 3D View"
          >
            ISO
          </button>
          <button
            onClick={() => setView('top')}
            className={`px-2 py-1 text-xs font-mono font-medium rounded transition-colors ${
              cameraView === 'top'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Top / Z-Down View"
          >
            TOP
          </button>
          <button
            onClick={() => setView('front')}
            className={`px-2 py-1 text-xs font-mono font-medium rounded transition-colors ${
              cameraView === 'front'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Front Elevation"
          >
            FRONT
          </button>
          <button
            onClick={() => setView('right')}
            className={`px-2 py-1 text-xs font-mono font-medium rounded transition-colors ${
              cameraView === 'right'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Right Side View"
          >
            SIDE
          </button>
        </div>

        {/* Right: Shading & Inspection Toggles */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg shadow-xl pointer-events-auto">
          {/* Shading mode selector */}
          <button
            onClick={() => setShadingMode('cad')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              shadingMode === 'cad'
                ? 'bg-cyan-500 text-slate-950 font-semibold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="PBR Studio CAD Polymer"
          >
            <Box className="w-3.5 h-3.5" />
            <span>CAD</span>
          </button>

          <button
            onClick={() => setShadingMode('overhang')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              shadingMode === 'overhang'
                ? 'bg-rose-500 text-white font-semibold shadow animate-pulse'
                : 'text-slate-400 hover:text-rose-400'
            }`}
            title="Overhang Angle Heatmap (>45° critical faces)"
          >
            <Flame className="w-3.5 h-3.5 text-rose-400" />
            <span>Overhangs</span>
          </button>

          <button
            onClick={() => setShadingMode('xray')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors ${
              shadingMode === 'xray'
                ? 'bg-indigo-500 text-white font-semibold shadow'
                : 'text-slate-400 hover:text-indigo-400'
            }`}
            title="Translucent X-Ray for Internal Cavities"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>X-Ray</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-800 mx-1" />

          {/* Wireframe toggle */}
          <button
            onClick={() => setWireframe(!wireframe)}
            className={`p-1.5 rounded transition-colors ${
              wireframe ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Wireframe Mesh"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* Bounding box toggle */}
          <button
            onClick={() => setShowBoundingBox(!showBoundingBox)}
            className={`p-1.5 rounded transition-colors ${
              showBoundingBox ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Bounding Dimensions Bracket"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-[1px] h-4 bg-slate-800 mx-1" />

          {/* Multi-Component Assembly Toggle */}
          <button
            onClick={() => setShowAssemblyPanel(!showAssemblyPanel)}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
              showAssemblyPanel
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Assembly Components Manager"
          >
            <Boxes className="w-3.5 h-3.5 text-indigo-400" />
            <span>Assembly ({components.length > 0 ? components.length : 1})</span>
          </button>

          {/* Assembly Exploded View Animation Toggle Button */}
          <button
            onClick={toggleExplodedViewAnimation}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
              isExploding
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25 animate-pulse'
                : explodeFactor > 0.05
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                : 'text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border-slate-700/60'
            }`}
            title={
              components.length > 1
                ? (explodeFactor > 0.05
                    ? 'Assemble Components (Click to Animate Assembly)'
                    : 'Assembly Exploded View (Click to Animate Separation & Reveal Internal Parts)')
                : 'Load 3-Piece Assembly Demo & Animate Exploded View'
            }
          >
            <Sparkles className={`w-3.5 h-3.5 ${isExploding ? 'animate-spin text-slate-950' : 'text-amber-400'}`} />
            <span>
              {isExploding
                ? (targetExplodeFactorRef.current === 0 ? 'Assembling...' : 'Exploding...')
                : explodeFactor > 0.05
                ? 'Exploded'
                : 'Exploded View'}
            </span>
            {explodeFactor > 0.05 && !isExploding && (
              <span className="text-[10px] font-mono px-1 py-0.2 bg-amber-500/30 text-amber-200 rounded">
                {(explodeFactor * 100).toFixed(0)}%
              </span>
            )}
          </button>

          <div className="w-[1px] h-4 bg-slate-800 mx-1" />

          {/* Support-Free DfAM Quick Action */}
          <button
            onClick={() => {
              setShadingMode('overhang');
              if (onOpenDfAMHub) onOpenDfAMHub();
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-900/60 hover:text-white"
            title="Inspect Support-Free DfAM Opportunities & CAD Geometric Fixes"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden xl:inline">DfAM Fixes</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-800 mx-1" />

          {/* Capture Viewport Renders Camera Symbol Button */}
          <button
            onClick={captureViewportRenders}
            disabled={!geometry || isCapturing || internalCapturing}
            className={`p-1.5 rounded transition-all flex items-center justify-center ${
              internalCapturing
                ? 'bg-cyan-500 text-slate-950 animate-pulse'
                : 'text-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/50 disabled:opacity-40'
            }`}
            title="Capture Viewport Renders"
            aria-label="Capture Viewport Renders"
          >
            <Camera className={`w-3.5 h-3.5 ${internalCapturing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Floating Selected Overhang Region DfAM Fix Banner */}
      {selectedRegion && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-lg w-[92%] bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 rounded-xl p-3 shadow-2xl flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">{selectedRegion.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-rose-500/20 text-rose-300 rounded border border-rose-500/30 uppercase">
                  {selectedRegion.severity}
                </span>
              </div>
              <div className="text-xs text-cyan-300 font-semibold mt-0.5">
                CAD Fix: {selectedRegion.suggestedModification.title}
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5 line-clamp-2">
                {selectedRegion.suggestedModification.description}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenDfAMHub && (
              <button
                onClick={onOpenDfAMHub}
                className="px-2.5 py-1 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-slate-950 rounded-lg shadow transition-colors whitespace-nowrap"
              >
                View CAD Recipe
              </button>
            )}
            {onSelectRegion && (
              <button
                onClick={() => onSelectRegion(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                title="Clear region focus"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Assembly Exploded View Status Overlay */}
      {(explodeFactor > 0.05 || isExploding) && !selectedRegion && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-amber-500/40 rounded-xl px-3.5 py-2 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-200">Assembly Exploded View</span>
              <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.2 rounded border border-amber-500/30">
                {(explodeFactor * 100).toFixed(0)}%
              </span>
            </div>
            <span className="text-[10px] text-slate-300">
              {isExploding ? 'Separating components smoothly...' : 'Revealing internal joints & mating features'}
            </span>
          </div>
          <button
            onClick={toggleExplodedViewAnimation}
            className="ml-2 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs shadow transition-all flex items-center gap-1 whitespace-nowrap"
            title="Animate back to fully assembled positions"
          >
            <span>Assemble</span>
          </button>
        </div>
      )}

      {/* Floating Object Reorientation & Alignment Bar */}
      {interactionMode !== 'measure' && (
        <div className="absolute top-16 left-3 flex items-center gap-1.5 p-1 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg shadow-xl pointer-events-auto">
          <span className="text-[10px] uppercase font-mono text-slate-400 px-1.5 font-semibold">
            {selectedCompId ? 'Orient Part:' : 'Orient Model:'}
          </span>
          <button
            onClick={() => rotateObject('x', 90)}
            className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-cyan-950/60 hover:text-cyan-300 text-slate-300 rounded border border-slate-700/60 transition-colors"
            title="Rotate +90° along X axis"
          >
            +90° X
          </button>
          <button
            onClick={() => rotateObject('y', 90)}
            className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-cyan-950/60 hover:text-cyan-300 text-slate-300 rounded border border-slate-700/60 transition-colors"
            title="Rotate +90° along Y axis"
          >
            +90° Y
          </button>
          <button
            onClick={() => rotateObject('z', 45)}
            className="px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-cyan-950/60 hover:text-cyan-300 text-slate-300 rounded border border-slate-700/60 transition-colors"
            title="Rotate +45° along Z axis on bed"
          >
            +45° Z
          </button>
          <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />
          <button
            onClick={groundObjectOnBed}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-emerald-950/60 hover:text-emerald-300 text-slate-300 rounded border border-slate-700/60 transition-colors"
            title="Lay Flat on Bed at Z=0"
          >
            <CornerDownRight className="w-3 h-3 text-emerald-400" />
            <span>Lay Flat</span>
          </button>
          <button
            onClick={centerObjectOnBed}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-slate-800 hover:bg-cyan-950/60 hover:text-cyan-300 text-slate-300 rounded border border-slate-700/60 transition-colors"
            title="Center on Bed Origin"
          >
            <Crosshair className="w-3 h-3 text-cyan-400" />
            <span>Center</span>
          </button>
          {isTransformed && onResetTransformations && (
            <>
              <div className="w-[1px] h-3.5 bg-slate-800 mx-0.5" />
              <button
                onClick={onResetTransformations}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono bg-rose-950/50 hover:bg-rose-900/60 hover:text-rose-200 text-rose-300 rounded border border-rose-500/40 transition-colors"
                title="Reset to original imported orientation"
              >
                <RotateCcw className="w-3 h-3 text-rose-400" />
                <span>Reset</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Floating Interactive Measure HUD (Point-to-Point Caliper) */}
      {interactionMode === 'measure' && (
        <div className="absolute top-16 left-3 flex items-center gap-2 p-1.5 bg-slate-900/95 backdrop-blur border border-cyan-500/40 rounded-xl shadow-2xl pointer-events-auto z-20">
          <div className="flex items-center gap-1.5 px-2">
            <Ruler className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-slate-200">Point-to-Point Caliper:</span>
          </div>

          <div className="text-xs font-mono font-medium px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800">
            {!measurePointA ? (
              <span className="text-slate-400 italic">Click 1st point on any component surface</span>
            ) : !measurePointB ? (
              <span className="text-amber-300 flex items-center gap-1.5">
                <span>Point A set •</span>
                <span className="text-cyan-300 font-bold">
                  {activeDistance ? `${activeDistance.toFixed(2)} mm (Live)` : 'Click 2nd point'}
                </span>
              </span>
            ) : (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span>Distance:</span>
                <span className="text-slate-100 text-sm">{activeDistance?.toFixed(2)} mm</span>
              </span>
            )}
          </div>

          {measurePointB && activeDistance !== null && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(`${activeDistance.toFixed(2)} mm`);
                setCopiedMeasurement(true);
                setTimeout(() => setCopiedMeasurement(false), 2000);
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 rounded-lg transition-colors"
              title="Copy distance to clipboard"
            >
              {copiedMeasurement ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedMeasurement ? 'Copied' : 'Copy'}</span>
            </button>
          )}

          {measurePointA && (
            <button
              onClick={clearMeasurement}
              className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors font-mono"
              title="Clear measurement points"
            >
              Clear
            </button>
          )}

          <button
            onClick={() => {
              setInteractionMode('orbit');
              clearMeasurement();
            }}
            className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Exit Measure Tool"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MULTI-COMPONENT ASSEMBLY MANAGER FLOATING DOCK */}
      {showAssemblyPanel && (
        <div className="absolute top-16 right-3 w-80 max-h-[calc(100%-150px)] flex flex-col bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl z-20 pointer-events-auto overflow-hidden">
          {/* Header */}
          <div className="p-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-slate-100">
                Assembly ({components.length > 0 ? components.length : 1} Components)
              </span>
            </div>
            <div className="flex items-center gap-1">
              {/* + Add Component Button */}
              {onImportMoreFiles && (
                <button
                  onClick={() => importMoreInputRef.current?.click()}
                  className="flex items-center gap-1 px-2 py-0.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-[11px] rounded transition-all"
                  title="Import and add another 3D mesh component (.stl, .3mf, .step) to this assembly"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Part</span>
                </button>
              )}
              <button
                onClick={() => setShowAssemblyPanel(false)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded"
                title="Close Assembly Dock"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Assembly Tools Toolbar */}
          <div className="p-2 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between gap-1 text-[11px]">
            <button
              onClick={handleAutoArrange}
              disabled={components.length <= 1}
              className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-cyan-950/50 hover:text-cyan-300 text-slate-300 rounded border border-slate-700/60 transition-colors disabled:opacity-40"
              title="Automatically distribute all components across the print bed with safe spacing"
            >
              <Grid className="w-3 h-3 text-cyan-400" />
              <span>Arrange Bed</span>
            </button>

            <button
              onClick={toggleExplodedViewAnimation}
              disabled={components.length <= 1 && !onLoadSample}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors disabled:opacity-40 ${
                isExploding
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold shadow animate-pulse'
                  : explodeFactor > 0.05
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
                  : 'bg-slate-800 text-slate-300 border-slate-700/60 hover:text-slate-100 hover:bg-slate-750'
              }`}
              title="Animate assembly outward to inspect internal interfaces, threads, and joints"
            >
              <Play className={`w-3 h-3 ${isExploding ? 'animate-spin text-slate-950' : 'text-amber-400'}`} />
              <span>{isExploding ? (targetExplodeFactorRef.current === 0 ? 'Assembling...' : 'Exploding...') : explodeFactor > 0.05 ? 'Assemble' : 'Animate Explode'}</span>
            </button>

            {selectedCompId && (
              <button
                onClick={() => setSelectedCompId(null)}
                className="px-2 py-1 text-slate-400 hover:text-slate-200 text-[10px]"
                title="Deselect part and select whole assembly"
              >
                Clear Sel.
              </button>
            )}
          </div>

          {/* Explode distance slider if expanded */}
          {components.length > 1 && (
            <div className="px-3 py-1.5 bg-slate-950/40 border-b border-slate-800/60 flex items-center gap-2 text-[10px] text-slate-400 font-mono">
              <span className="shrink-0">Explode:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={explodeFactor}
                onChange={(e) => handleExplodeChange(parseFloat(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
              <span className="w-9 text-right font-bold text-amber-300">
                {(explodeFactor * 100).toFixed(0)}%
              </span>
              {explodeFactor > 0.02 && (
                <button
                  onClick={() => handleExplodeChange(0)}
                  className="px-1 py-0.5 text-[9px] text-slate-400 hover:text-amber-300 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                  title="Reset to 0% assembled"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {/* Components List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 max-h-64">
            {components.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                Single component loaded. Click <strong className="text-cyan-300">+ Add Part</strong> to assemble multiple 3D meshes.
              </div>
            ) : (
              components.map((comp, idx) => {
                const isSelected = comp.id === selectedCompId;
                return (
                  <div
                    key={comp.id}
                    onClick={() => setSelectedCompId(isSelected ? null : comp.id)}
                    className={`p-2 rounded-lg border transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-cyan-950/50 border-cyan-500/60 shadow'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Component Color Swatch Pill */}
                        <div
                          className="w-3 h-3 rounded-full shrink-0 border border-white/20 shadow"
                          style={{ backgroundColor: comp.color || COMPONENT_PALETTE[idx % COMPONENT_PALETTE.length] }}
                        />
                        <span
                          className={`text-xs font-semibold truncate ${
                            isSelected ? 'text-cyan-200' : 'text-slate-200'
                          }`}
                          title={comp.name}
                        >
                          {comp.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {/* Toggle visibility */}
                        <button
                          onClick={(e) => toggleComponentVisibility(comp.id, e)}
                          className={`p-1 rounded transition-colors ${
                            comp.visible !== false ? 'text-slate-400 hover:text-cyan-400' : 'text-slate-600 hover:text-slate-400'
                          }`}
                          title={comp.visible !== false ? 'Hide component' : 'Show component'}
                        >
                          {comp.visible !== false ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </button>

                        {/* Remove part button */}
                        {components.length > 1 && (
                          <button
                            onClick={(e) => removeComponent(comp.id, e)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                            title="Remove part from assembly"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Live Dynamic Coordinates Badge */}
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="text-cyan-300">
                        Pos: [{(livePositions[comp.id] || comp.position).map((v) => (v > 0 ? `+${v.toFixed(0)}` : v.toFixed(0))).join(', ')}] mm
                      </span>
                      {explodeFactor > 0.05 && (
                        <span className="text-[9px] text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded font-semibold border border-amber-500/30">
                          Exploded
                        </span>
                      )}
                    </div>

                    {/* Metadata & Nudge Coordinates when Selected */}
                    {isSelected && (
                      <div className="pt-1.5 border-t border-cyan-500/20 text-[10px] font-mono text-slate-300 flex flex-col gap-1">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Target Coordinate Vector</span>
                          <span className="uppercase text-[9px] bg-cyan-500/20 text-cyan-300 px-1 rounded">
                            {comp.format}
                          </span>
                        </div>

                        {/* Interactive Nudge Translation Buttons */}
                        <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-slate-800">
                          <span className="text-[9px] text-slate-400 font-semibold uppercase">Nudge:</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                nudgeComponent('x', -5);
                              }}
                              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                              title="Move -5mm X"
                            >
                              -X
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                nudgeComponent('x', 5);
                              }}
                              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                              title="Move +5mm X"
                            >
                              +X
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                nudgeComponent('y', -5);
                              }}
                              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                              title="Move -5mm Y"
                            >
                              -Y
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                nudgeComponent('y', 5);
                              }}
                              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                              title="Move +5mm Y"
                            >
                              +Y
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                nudgeComponent('z', 5);
                              }}
                              className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
                              title="Move +5mm Z (Raise)"
                            >
                              +Z
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Mode Instruction Tooltip */}
      {interactionMode !== 'orbit' && interactionMode !== 'measure' && (
        <div className="absolute top-28 left-3 flex items-center gap-2 px-3 py-1.5 bg-cyan-950/90 backdrop-blur border border-cyan-500/40 rounded-lg text-cyan-200 text-xs shadow-lg pointer-events-auto animate-pulse">
          <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>
            {selectedCompId
              ? `Transforming [${selectedComponent?.name || 'Selected Part'}]. Drag mouse in viewport to manipulate.`
              : interactionMode === 'rotate'
              ? 'Click & drag mouse to rotate assembly. Select a part from the Assembly panel to move parts individually.'
              : 'Click & drag mouse to move assembly (Hold Shift for Z height).'}
          </span>
        </div>
      )}

      {/* Measure Tool Helper Hint */}
      {interactionMode === 'measure' && (
        <div className="absolute top-28 left-3 flex items-center gap-2 px-3 py-1.5 bg-cyan-950/90 backdrop-blur border border-cyan-500/40 rounded-lg text-cyan-200 text-xs shadow-lg pointer-events-auto">
          <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>
            Click two points across any component surfaces to calculate tolerances, clearances, and Euclidean distance.
          </span>
        </div>
      )}

      {/* Overhang Alert Badge */}
      {geometryData && geometryData.overhangPercentage > 5 && interactionMode === 'orbit' && (
        <div className="absolute top-28 left-3 flex items-center gap-2 px-3 py-1.5 bg-rose-950/80 backdrop-blur border border-rose-500/40 rounded-lg text-rose-300 text-xs shadow-lg pointer-events-auto">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>
            Critical overhangs detected:{' '}
            <strong className="font-mono font-bold text-rose-200">
              {geometryData.overhangPercentage.toFixed(1)}%
            </strong>{' '}
            of surface requires support
          </span>
        </div>
      )}

      {/* Bottom Geometric Telemetry HUD */}
      <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
        <div className="p-3 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl shadow-2xl pointer-events-auto grid grid-cols-2 sm:grid-cols-5 gap-3">
          {/* Bounding Dimensions */}
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              {selectedCompId ? 'Selected Part Envelope' : 'Assembly Envelope'}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xs sm:text-sm font-mono font-semibold text-slate-100">
                {geometryData
                  ? `${geometryData.dimX.toFixed(1)} × ${geometryData.dimY.toFixed(1)} × ${geometryData.dimZ.toFixed(1)}`
                  : '0 × 0 × 0'}
              </span>
              <span className="text-[10px] font-mono text-cyan-400">mm</span>
            </div>
          </div>

          {/* Volume */}
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Total Volume
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xs sm:text-sm font-mono font-semibold text-slate-100">
                {geometryData ? geometryData.volumeCm3.toFixed(2) : '0.00'}
              </span>
              <span className="text-[10px] font-mono text-cyan-400">cm³</span>
            </div>
          </div>

          {/* Estimated Solid Mass */}
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Assembly Mass
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xs sm:text-sm font-mono font-semibold text-emerald-400">
                {geometryData ? geometryData.estimatedMassGrams.toFixed(1) : '0.0'}
              </span>
              <span className="text-[10px] font-mono text-slate-400">grams</span>
            </div>
          </div>

          {/* Overhang Critical Zones */}
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Overhangs (&gt;{overhangThreshold}°)
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span
                className={`text-xs sm:text-sm font-mono font-semibold ${
                  geometryData && geometryData.overhangPercentage > 10
                    ? 'text-rose-400'
                    : geometryData && geometryData.overhangPercentage > 0
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {geometryData ? `${geometryData.overhangPercentage.toFixed(1)}%` : '0%'}
              </span>
              <span className="text-[10px] text-slate-400">
                ({geometryData?.criticalOverhangCount || 0} faces)
              </span>
            </div>
          </div>

          {/* Components Count & Footprint */}
          <div className="hidden sm:flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              Components in Scene
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-xs sm:text-sm font-mono font-semibold text-cyan-300">
                {components.length > 0 ? `${components.length} parts` : '1 single mesh'}
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                ({geometryData ? geometryData.footprintAreaMm2.toFixed(0) : '0'} mm² footprint)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
