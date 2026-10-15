import JSZip from 'jszip';
import { CADProject } from '../types/cad';

export interface BulkExportOptions {
  includeSpecSheets: boolean;
  includeTags: boolean;
  includeRenders: boolean;
  includeSlicerSettings: boolean;
  includeHardwareBOM: boolean;
  includeMasterIndex: boolean;
}

export const DEFAULT_BULK_EXPORT_OPTIONS: BulkExportOptions = {
  includeSpecSheets: true,
  includeTags: true,
  includeRenders: true,
  includeSlicerSettings: true,
  includeHardwareBOM: true,
  includeMasterIndex: true,
};

/**
 * Sanitizes a filename for cross-platform folder naming (Windows/Mac/Linux)
 */
export function sanitizeFolderName(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '') // remove extension if present
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[-\s]+/g, '_');
}

/**
 * Generates formatted Markdown for an individual project's spec sheet
 */
export function formatProjectSpecMarkdown(proj: CADProject): string {
  const spec = proj.spec;
  const geo = proj.geometry;
  const settings = proj.settings;

  const title = spec?.title || proj.fileName.replace(/\.[^/.]+$/, '');
  const pitch = spec?.pitch || 'Precision 3D printable mechanical CAD component engineered for additive manufacturing.';

  let md = `# ${title}

> ${pitch}

---

## 🖨️ Recommended Slicing Profile (${settings.printerEcosystem || 'Standard FDM'})
* **Target Printer:** ${settings.targetPrinter || 'Generic FDM'}
* **Filament Material:** ${settings.filament} (${settings.nozzleTemp}°C Nozzle / ${settings.bedTemp}°C Bed)
`;

  if (spec?.slicingProfile) {
    const sp = spec.slicingProfile;
    md += `* **Layer Height:** ${sp.recommendedLayerHeight}
* **Wall Perimeters:** ${sp.wallPerimeters}
* **Top / Bottom Solid Layers:** ${sp.topBottomLayers}
* **Infill Pattern & Density:** ${sp.infillPattern} (${sp.infillDensity || `${settings.infillTarget}%`})
* **Supports:** ${sp.supportType} (${sp.supportThresholdAngle})
* **Bed Adhesion:** ${sp.bedAdhesion}
* **Est. Print Time:** ~${spec.estimatedPrintTimeHours || '1h 30m'}

### 📐 Print Orientation & Bed Adhesion
${sp.printOrientation}

### ❄️ Cooling & Speed Guidelines
${sp.coolingAndSpeedNotes}
`;
  } else {
    md += `* **Nozzle Diameter:** ${settings.nozzleDiameter}
* **Infill:** ${settings.infillTarget}%
* **Functional Intent:** ${settings.functionalIntent}
`;
  }

  md += `\n---\n\n## 🔩 Hardware Bill of Materials (BOM)\n`;
  if (spec?.hardwareBOM && spec.hardwareBOM.length > 0) {
    md += spec.hardwareBOM
      .map((b) => `* **${b.quantity}x** ${b.item} (${b.type}) — *${b.notes}*`)
      .join('\n');
  } else {
    md += `* No external hardware required. 100% 3D printed assembly.`;
  }

  md += `\n\n---\n\n## 🛠️ Assembly & Post-Processing Instructions\n`;
  md += spec?.assemblyManual || '1. Clean build plate and inspect part dimensions after cooling.\n2. Verify tolerances and deburr edges if necessary.\n3. Ready for assembly and deployment.';

  if (geo) {
    md += `\n\n---\n\n## 📏 Geometric Telemetry (Direct CAD Analysis)\n`;
    md += `* **Dimensions (X × Y × Z):** ${geo.dimX.toFixed(1)} × ${geo.dimY.toFixed(1)} × ${geo.dimZ.toFixed(1)} mm\n`;
    md += `* **Solid Part Volume:** ${geo.volumeCm3.toFixed(2)} cm³\n`;
    md += `* **Estimated Part Mass:** ${geo.estimatedMassGrams.toFixed(1)} g (${settings.filament})\n`;
    md += `* **Bed Footprint Area:** ${geo.footprintAreaMm2?.toFixed(0) || 'N/A'} mm²\n`;
    md += `* **Critical Overhang Faces:** ${(geo.criticalOverhangCount || 0).toLocaleString()} / ${(geo.totalFaces || 0).toLocaleString()} (${(geo.overhangPercentage || 0).toFixed(1)}%)\n`;
  }

  if (spec?.tags && spec.tags.length > 0) {
    md += `\n---\n\n## 🏷️ Platform Tags (Printables / MakerWorld / Thingiverse)\n`;
    md += spec.tags.join(' ') + '\n';
  }

  return md.trim();
}

/**
 * Builds the Master CATALOG_INDEX.md for the bulk export root
 */
export function buildMasterCatalogIndex(projects: CADProject[], exportedDate: string): string {
  let md = `# CAD-Tagger Master 3D Print Catalog Archive

**Export Date:** ${exportedDate}  
**Total Projects Packaged:** ${projects.length}  
**Format:** Organized Multi-Project Asset Bundle for MakerWorld, Printables & Slicers  

---

## 📋 Catalog Summary Matrix

| # | Part / Project Name | File Name | Filament | Bounding Box (mm) | Volume (cm³) | Est. Mass | Est. Print Time | External BOM |
|---|---|---|---|---|---|---|---|---|
`;

  projects.forEach((p, idx) => {
    const num = (idx + 1).toString().padStart(2, '0');
    const title = p.spec?.title || p.fileName;
    const filament = p.settings.filament || 'PLA';
    const dims = p.geometry ? `${p.geometry.dimX.toFixed(0)}×${p.geometry.dimY.toFixed(0)}×${p.geometry.dimZ.toFixed(0)}` : 'N/A';
    const vol = p.geometry ? p.geometry.volumeCm3.toFixed(1) : 'N/A';
    const mass = p.geometry ? `${p.geometry.estimatedMassGrams.toFixed(1)}g` : 'N/A';
    const printTime = p.spec?.estimatedPrintTimeHours ? `~${p.spec.estimatedPrintTimeHours}` : 'N/A';
    const bomCount = p.spec?.hardwareBOM?.length || 0;
    const bomText = bomCount > 0 ? `${bomCount} item${bomCount > 1 ? 's' : ''}` : 'None (100% 3D)';

    md += `| ${num} | [${title}](./${num}_${sanitizeFolderName(p.fileName)}/README.md) | \`${p.fileName}\` | ${filament} | ${dims} | ${vol} | ${mass} | ${printTime} | ${bomText} |\n`;
  });

  md += `\n---\n\n## 📁 Directory Architecture\n\nEach subfolder in this archive contains:\n`;
  md += `- **\`README.md\`**: Complete print specification sheet, slicing recommendations, and assembly guide formatted for 3D model sharing platforms.\n`;
  md += `- **\`tags.txt\`**: One-click platform tags ready for copy/pasting into MakerWorld and Printables.\n`;
  md += `- **\`slicer_settings.json\`**: Machine and slicing profile parameters for import or reference.\n`;
  md += `- **\`hardware_bom.csv\`**: Bill of materials itemizing all fasteners, magnets, and heat-set inserts (if required).\n`;
  md += `- **\`renders/\`**: High-resolution multi-perspective CAD viewport preview renders.\n`;

  md += `\n---\n\n*Generated by CAD-Tagger — Precision Spec & Slicer Hub for 3D Printing Makers.*`;

  return md;
}

/**
 * Packages multiple projects into a single organized ZIP file
 */
export async function packageBulkCatalogZip(
  projects: CADProject[],
  options: BulkExportOptions = DEFAULT_BULK_EXPORT_OPTIONS,
  onProgress?: (progress: { current: number; total: number; currentItemName: string }) => void
): Promise<Blob> {
  const zip = new JSZip();
  const exportedDate = new Date().toLocaleString();

  // 1. Root Master Index and Manifest
  if (options.includeMasterIndex) {
    const masterIndexMd = buildMasterCatalogIndex(projects, exportedDate);
    zip.file('CATALOG_INDEX.md', masterIndexMd);

    const manifestData = {
      exportTitle: 'CAD-Tagger Catalog Bulk Export',
      exportedAt: new Date().toISOString(),
      projectCount: projects.length,
      projects: projects.map((p, idx) => ({
        index: idx + 1,
        id: p.id,
        fileName: p.fileName,
        title: p.spec?.title || p.fileName,
        printer: p.settings.targetPrinter,
        filament: p.settings.filament,
        dimensions: p.geometry
          ? {
              x: p.geometry.dimX,
              y: p.geometry.dimY,
              z: p.geometry.dimZ,
              volumeCm3: p.geometry.volumeCm3,
              massGrams: p.geometry.estimatedMassGrams,
            }
          : null,
        specGenerated: !!p.spec,
        tagsCount: p.spec?.tags.length || 0,
        renderCount: p.snapshots?.length || 0,
        hardwareBOMCount: p.spec?.hardwareBOM?.length || 0,
      })),
    };
    zip.file('catalog_manifest.json', JSON.stringify(manifestData, null, 2));
  }

  // 2. Iterate each project and add organized folder
  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    const prefix = (i + 1).toString().padStart(2, '0');
    const folderName = `${prefix}_${sanitizeFolderName(proj.fileName)}`;
    const projFolder = zip.folder(folderName) || zip;

    if (onProgress) {
      onProgress({
        current: i + 1,
        total: projects.length,
        currentItemName: proj.spec?.title || proj.fileName,
      });
    }

    // A. Spec Sheet (README.md)
    if (options.includeSpecSheets) {
      const specMd = formatProjectSpecMarkdown(proj);
      projFolder.file('README.md', specMd);
    }

    // B. Tags (tags.txt)
    if (options.includeTags && proj.spec?.tags && proj.spec.tags.length > 0) {
      const tagsContent = `# Platform Tags for ${proj.fileName}
# Formatted for MakerWorld, Printables, Thangs, Cults3D

# Comma-separated:
${proj.spec.tags.join(', ')}

# Space-separated:
${proj.spec.tags.join(' ')}

# Line-by-line:
${proj.spec.tags.join('\n')}
`;
      projFolder.file('tags.txt', tagsContent);
    }

    // C. Slicer Settings JSON
    if (options.includeSlicerSettings) {
      const slicerData = {
        projectTitle: proj.spec?.title || proj.fileName,
        sourceFileName: proj.fileName,
        fileType: proj.fileType,
        timestamp: proj.timestamp,
        printerEcosystem: proj.settings.printerEcosystem,
        targetPrinter: proj.settings.targetPrinter,
        filament: {
          name: proj.settings.filament,
          densityGcm3: proj.settings.filamentDensity,
          recommendedNozzleTempC: proj.settings.nozzleTemp,
          recommendedBedTempC: proj.settings.bedTemp,
        },
        machineParams: {
          nozzleDiameter: proj.settings.nozzleDiameter,
          targetInfillPercent: proj.settings.infillTarget,
          functionalIntent: proj.settings.functionalIntent,
          userNotes: proj.settings.userNotes,
        },
        slicingProfile: proj.spec?.slicingProfile || null,
        geometryTelemetry: proj.geometry || null,
      };
      projFolder.file('slicer_settings.json', JSON.stringify(slicerData, null, 2));
    }

    // D. Hardware BOM CSV
    if (options.includeHardwareBOM && proj.spec?.hardwareBOM && proj.spec.hardwareBOM.length > 0) {
      const csvHeader = 'Item,Quantity,Type,Notes\n';
      const csvRows = proj.spec.hardwareBOM
        .map((b) => `"${b.item.replace(/"/g, '""')}","${b.quantity}","${b.type.replace(/"/g, '""')}","${b.notes.replace(/"/g, '""')}"`)
        .join('\n');
      projFolder.file('hardware_bom.csv', csvHeader + csvRows);
    }

    // E. Rendered Preview Images
    if (options.includeRenders && proj.snapshots && proj.snapshots.length > 0) {
      const rendersFolder = projFolder.folder('renders') || projFolder;
      for (const snap of proj.snapshots) {
        if (!snap.dataUrl) continue;

        const cleanViewName = (snap.viewName || 'render').toLowerCase().replace(/[^\w-]/g, '_');

        if (snap.dataUrl.startsWith('data:image/svg+xml')) {
          // SVG Image
          if (snap.dataUrl.includes(';base64,')) {
            const base64 = snap.dataUrl.split(';base64,')[1];
            rendersFolder.file(`${cleanViewName}.svg`, base64, { base64: true });
          } else {
            const svgContent = decodeURIComponent(snap.dataUrl.split('data:image/svg+xml,')[1] || '');
            rendersFolder.file(`${cleanViewName}.svg`, svgContent);
          }
        } else if (snap.dataUrl.startsWith('data:image/png') || snap.dataUrl.startsWith('data:image/jpeg')) {
          // PNG / JPEG Image
          const base64 = snap.dataUrl.split(',')[1];
          if (base64) {
            rendersFolder.file(`${cleanViewName}.png`, base64, { base64: true });
          }
        }
      }
    }
  }

  // 3. Compress into final Blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return zipBlob;
}
