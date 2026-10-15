import React from 'react';
import { History, Trash2, Clock, CheckCircle2, ChevronRight, HardDrive } from 'lucide-react';
import { CADProject } from '../types/cad';

interface ProjectHistoryProps {
  projects: CADProject[];
  currentProjectId: string | null;
  onSelectProject: (project: CADProject) => void;
  onDeleteProject: (projectId: string) => void;
  onClearAll: () => void;
}

export const ProjectHistory: React.FC<ProjectHistoryProps> = ({
  projects,
  currentProjectId,
  onSelectProject,
  onDeleteProject,
  onClearAll,
}) => {
  if (projects.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-900/30 border border-slate-800 rounded-xl text-slate-500 text-xs">
        <History className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
        <div>No processed parts in catalog yet.</div>
        <div className="text-[10px] text-slate-600 mt-1">
          Loaded parts and generated spec sheets are automatically saved here.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="flex items-center gap-1.5 font-medium">
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>Local Catalog ({projects.length} parts)</span>
        </span>
        <button
          onClick={onClearAll}
          className="text-[10px] text-rose-400/80 hover:text-rose-400 transition-colors"
        >
          Clear History
        </button>
      </div>

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {projects.map((proj) => {
          const isSelected = proj.id === currentProjectId;
          const dateStr = new Date(proj.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={proj.id}
              onClick={() => onSelectProject(proj)}
              className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                isSelected
                  ? 'border-cyan-500 bg-cyan-950/30 shadow-md'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {proj.snapshots && proj.snapshots[0] ? (
                  <img
                    src={proj.snapshots[0].dataUrl}
                    alt={proj.fileName}
                    className="w-10 h-10 rounded-lg object-cover bg-slate-950 border border-slate-800 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                    <HardDrive className="w-4 h-4 text-slate-600" />
                  </div>
                )}

                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-200 truncate flex items-center gap-1.5">
                    <span>{proj.fileName}</span>
                    {proj.spec && (
                      <span className="text-[9px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded font-mono">
                        SPEC
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate flex items-center gap-2">
                    <span>
                      {proj.geometry.dimX.toFixed(0)}×{proj.geometry.dimY.toFixed(0)}×{proj.geometry.dimZ.toFixed(0)}mm
                    </span>
                    <span>•</span>
                    <span className="text-cyan-400">{proj.settings.filament}</span>
                    <span>•</span>
                    <span className="text-slate-500">{dateStr}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(proj.id);
                  }}
                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove from history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight
                  className={`w-4 h-4 transition-transform ${
                    isSelected ? 'text-cyan-400 translate-x-0.5' : 'text-slate-600'
                  }`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
