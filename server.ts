import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Gemini Analysis Endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    const { modelName, images, geometry, settings } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'At least one viewport render image is required.' });
    }

    const targetModel = modelName || 'gemini-2.5-flash';

    // Prepare multimodal contents
    const contentsParts: any[] = [];

    // Add captured viewport renders as inline images
    for (const img of images) {
      if (img.dataUrl && img.dataUrl.includes(',')) {
        const [meta, base64] = img.dataUrl.split(',');
        const mimeMatch = meta.match(/data:([^;]+);base64/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        contentsParts.push({
          inlineData: {
            mimeType,
            data: base64,
          },
        });
      }
    }

    const promptText = `
You are CAD-Tagger, an expert 3D printing engineer and manufacturing specialist for community marketplaces like Printables, MakerWorld, Cults3D, and Thangs.

Analyze this 3D model geometry and the multi-angle viewport renders:

Model File Name: ${settings?.fileName || '3D_Model.stl'}
Printer Ecosystem: ${settings?.printerEcosystem || 'Bambu Lab'}
Target Printer: ${settings?.targetPrinter || 'Bambu Lab X1-Carbon / P1S'}
Filament Material: ${settings?.filament || 'PLA'} (Density: ${settings?.filamentDensity || 1.24} g/cm³, Bed Temp: ${settings?.bedTemp || '60'}°C, Nozzle Temp: ${settings?.nozzleTemp || '215'}°C)
Functional Intent: ${settings?.functionalIntent || 'Mechanical / Structural'}
Nozzle Diameter: ${settings?.nozzleDiameter || '0.4mm'}
Additional Maker Context / Notes: ${settings?.userNotes || 'Standard functional 3D printable part.'}

Computed Geometric Telemetry from Mesh:
- Bounding Dimensions (X, Y, Z): ${geometry?.dimX?.toFixed(1) || 0} x ${geometry?.dimY?.toFixed(1) || 0} x ${geometry?.dimZ?.toFixed(1) || 0} mm
- Calculated Volume: ${geometry?.volumeCm3?.toFixed(2) || 0} cm³ (${((geometry?.volumeCm3 || 0) * 1000).toFixed(0)} mm³)
- Estimated Mass (Solid): ${geometry?.estimatedMassGrams?.toFixed(1) || 0} g
- Surface Area: ${geometry?.surfaceAreaCm2?.toFixed(1) || 0} cm²
- Overhang Faces (>45° critical overhang): ${geometry?.overhangPercentage?.toFixed(1) || 0}% of surface area (${geometry?.criticalOverhangCount || 0} critical faces detected)
- Print Bed Footprint Area: ${geometry?.footprintAreaMm2?.toFixed(0) || 0} mm²

Task:
Generate a complete, production-grade 3D model spec sheet, slicer profile, SEO tags, assembly manual, and hardware Bill of Materials (BOM).
Return strictly structured JSON adhering to the specified schema.
`;

    contentsParts.push({
      text: promptText,
    });

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: { parts: contentsParts },
      config: {
        systemInstruction:
          'You are CAD-Tagger, a precision 3D printing and CAD documentation engine. Generate accurate, platform-optimized specifications for 3D printing makers. Ensure slicing recommendations account for overhang angles, mechanical intent, and printer ecosystem.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'SEO-optimized marketplace listing title (max 70 chars)',
            },
            pitch: {
              type: Type.STRING,
              description: 'Concise, high-converting summary pitch for Printables/MakerWorld',
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '10 to 15 platform tags (e.g. #FunctionalPrint, #MakerWorld, #Gridfinity)',
            },
            slicingProfile: {
              type: Type.OBJECT,
              properties: {
                recommendedLayerHeight: {
                  type: Type.STRING,
                  description: 'Recommended layer height with rationale (e.g. 0.16mm Optimal)',
                },
                wallPerimeters: {
                  type: Type.STRING,
                  description: 'Number of wall loops / perimeters based on functional intent',
                },
                topBottomLayers: {
                  type: Type.STRING,
                  description: 'Recommended top and bottom solid shell layers',
                },
                infillPattern: {
                  type: Type.STRING,
                  description: 'Infill pattern (e.g. Gyroid, Adaptive Cubic, Honeycomb)',
                },
                infillDensity: {
                  type: Type.STRING,
                  description: 'Infill density percentage (e.g. 25%)',
                },
                supportType: {
                  type: Type.STRING,
                  description: 'Recommended support style (Tree/Organic vs Snug/Grid, buildplate only)',
                },
                supportThresholdAngle: {
                  type: Type.STRING,
                  description: 'Overhang threshold angle for supports based on geometry',
                },
                bedAdhesion: {
                  type: Type.STRING,
                  description: 'Brim, skirt, or raft recommendations and build plate type',
                },
                printOrientation: {
                  type: Type.STRING,
                  description: 'Critical build plate orientation instructions to maximize strength and minimize supports',
                },
                coolingAndSpeedNotes: {
                  type: Type.STRING,
                  description: 'Cooling fan percentage and speed advice for this filament & geometry',
                },
              },
              required: [
                'recommendedLayerHeight',
                'wallPerimeters',
                'topBottomLayers',
                'infillPattern',
                'infillDensity',
                'supportType',
                'supportThresholdAngle',
                'bedAdhesion',
                'printOrientation',
                'coolingAndSpeedNotes',
              ],
            },
            assemblyManual: {
              type: Type.STRING,
              description: 'Step-by-step assembly instructions in clear Markdown format with headings and bullet points',
            },
            hardwareBOM: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING, description: 'Hardware item name (e.g., M3x12mm BHCS Screw)' },
                  quantity: { type: Type.STRING, description: 'Quantity needed' },
                  type: { type: Type.STRING, description: 'Fastener, Insert, Bearing, Magnet, Electronic, Other' },
                  notes: { type: Type.STRING, description: 'Specification, DIN standard, or installation tip' },
                },
                required: ['item', 'quantity', 'type', 'notes'],
              },
              description: 'Itemized hardware list required for assembly or mounting',
            },
            estimatedPrintTimeHours: {
              type: Type.STRING,
              description: 'Estimated print time range (e.g. 2h 45m - 3h 15m on Bambu X1C)',
            },
            compatibilityNotes: {
              type: Type.STRING,
              description: 'Print bed clearance, enclosure needs, and compatibility callouts',
            },
          },
          required: [
            'title',
            'pitch',
            'tags',
            'slicingProfile',
            'assemblyManual',
            'hardwareBOM',
            'estimatedPrintTimeHours',
            'compatibilityNotes',
          ],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error('Gemini returned an empty response.');
    }

    const parsed = JSON.parse(resultText);
    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error generating analysis:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate 3D CAD analysis with Gemini.',
    });
  }
});

// Vite Middleware for Dev, Static serving for Production
const isProd = process.env.NODE_ENV === 'production';

if (!isProd) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`CAD-Tagger server running on port ${port}`);
});
