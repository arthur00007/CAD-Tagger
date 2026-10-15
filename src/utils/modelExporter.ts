import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import JSZip from 'jszip';

export type ExportFormat = 'stl-binary' | 'stl-ascii' | '3mf';

export interface ModelExportOptions {
  fileName: string;
  format: ExportFormat;
  isTransformed?: boolean;
  modelTitle?: string;
  designer?: string;
}

export interface ExportResult {
  blob: Blob;
  suggestedFileName: string;
  format: ExportFormat;
  byteSize: number;
}

/**
 * Clean base filename without extension
 */
export function getBaseFileName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

/**
 * Computes estimated file sizes for different export formats
 */
export function estimateExportSizes(geometry: THREE.BufferGeometry): {
  triangleCount: number;
  vertexCount: number;
  estimatedStlBinaryBytes: number;
  estimatedStlAsciiBytes: number;
  estimated3mfBytes: number;
} {
  const posAttr = geometry.attributes.position;
  const indexAttr = geometry.index;
  const triangleCount = indexAttr ? indexAttr.count / 3 : (posAttr ? posAttr.count / 3 : 0);
  const vertexCount = posAttr ? posAttr.count : 0;

  // STL Binary: 80 bytes header + 4 bytes triangle count + (50 bytes per triangle)
  const estimatedStlBinaryBytes = Math.round(84 + triangleCount * 50);

  // STL ASCII: ~250 bytes per triangle
  const estimatedStlAsciiBytes = Math.round(80 + triangleCount * 250);

  // 3MF: XML compressed with zip is typically ~15-20% of STL size
  const estimated3mfBytes = Math.round(Math.max(1024, triangleCount * 12));

  return {
    triangleCount,
    vertexCount,
    estimatedStlBinaryBytes,
    estimatedStlAsciiBytes,
    estimated3mfBytes,
  };
}

/**
 * Exports Three.js BufferGeometry to Binary or ASCII STL
 */
export function exportToSTL(
  geometry: THREE.BufferGeometry,
  binary: boolean = true
): Blob {
  const mesh = new THREE.Mesh(geometry);
  const exporter = new STLExporter();
  const output = exporter.parse(mesh, { binary });

  if (binary) {
    // When binary: true, STLExporter returns a DataView
    const dataView = output as DataView;
    const uint8 = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
    return new Blob([uint8 as unknown as BlobPart], { type: 'application/octet-stream' });
  } else {
    // When binary: false, STLExporter returns a string
    return new Blob([output as string], { type: 'text/plain;charset=utf-8' });
  }
}

/**
 * Exports Three.js BufferGeometry to valid 3MF (3D Manufacturing Format) OPC zip archive.
 * Compliant with 3MF Core Specification (XML + relationships + packaging).
 * Supported by Bambu Studio, PrusaSlicer, OrcaSlicer, Cura, Windows 3D Viewer.
 */
export async function exportTo3MF(
  geometry: THREE.BufferGeometry,
  options: {
    modelTitle?: string;
    designer?: string;
  } = {}
): Promise<Blob> {
  const title = options.modelTitle || 'CAD-Tagger 3D Model';
  const designer = options.designer || 'CAD-Tagger Maker';

  // Ensure vertex positions exist
  const posAttr = geometry.attributes.position;
  if (!posAttr) {
    throw new Error('Geometry lacks position attributes for 3MF export.');
  }

  const indexAttr = geometry.index;
  const numVertices = posAttr.count;

  // Build vertex XML string
  const vertexLines: string[] = [];
  for (let i = 0; i < numVertices; i++) {
    const x = posAttr.getX(i).toFixed(4);
    const y = posAttr.getY(i).toFixed(4);
    const z = posAttr.getZ(i).toFixed(4);
    vertexLines.push(`        <vertex x="${x}" y="${y}" z="${z}" />`);
  }

  // Build triangle XML string
  const triangleLines: string[] = [];
  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i += 3) {
      const v1 = indexAttr.getX(i);
      const v2 = indexAttr.getX(i + 1);
      const v3 = indexAttr.getX(i + 2);
      triangleLines.push(`        <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
    }
  } else {
    for (let i = 0; i < numVertices; i += 3) {
      triangleLines.push(`        <triangle v1="${i}" v2="${i + 1}" v3="${i + 2}" />`);
    }
  }

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${escapeXml(title)}</metadata>
  <metadata name="Designer">${escapeXml(designer)}</metadata>
  <metadata name="Application">CAD-Tagger 3D Print Spec &amp; Slicer Profile Engine</metadata>
  <resources>
    <object id="1" type="model">
      <mesh>
        <vertices>
${vertexLines.join('\n')}
        </vertices>
        <triangles>
${triangleLines.join('\n')}
        </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypesXml);
  zip.folder('_rels')?.file('.rels', relsXml);
  zip.folder('3D')?.file('3dmodel.model', modelXml);

  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an export bundle for the given geometry
 */
export async function exportModel(
  geometry: THREE.BufferGeometry,
  options: ModelExportOptions
): Promise<ExportResult> {
  const baseName = getBaseFileName(options.fileName);
  const suffix = options.isTransformed ? '_reoriented' : '';

  let blob: Blob;
  let ext: string;

  if (options.format === 'stl-binary') {
    blob = exportToSTL(geometry, true);
    ext = 'stl';
  } else if (options.format === 'stl-ascii') {
    blob = exportToSTL(geometry, false);
    ext = 'stl';
  } else {
    blob = await exportTo3MF(geometry, {
      modelTitle: options.modelTitle || `${baseName}${suffix}`,
      designer: options.designer || 'CAD-Tagger',
    });
    ext = '3mf';
  }

  const suggestedFileName = `${baseName}${suffix}.${ext}`;

  return {
    blob,
    suggestedFileName,
    format: options.format,
    byteSize: blob.size,
  };
}

/**
 * Triggers browser download for a Blob
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
