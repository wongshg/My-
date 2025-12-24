import React, { useState, useEffect, useRef } from 'react';
import { Matter, Task, Stage, TaskStatus, Material } from '../types';
import StatusBadge from './StatusBadge';
import TaskDetailPane from './TaskDetailPane';
import JudgmentTimeline from './JudgmentTimeline';
import { 
  Plus, ArrowLeft, Edit2, Archive, 
  Trash2, LayoutTemplate, Briefcase, X, Check, Download, Save, ChevronRight, Calendar, Clock,
  Moon, Sun, Monitor, FileText, Package, LayoutDashboard, SunMoon, MoreHorizontal
} from 'lucide-react';
import { analyzeMatter } from '../services/geminiService';
import JSZip from 'jszip';
import { getFile } from '../services/storage';

interface Props {
  matter: Matter;
  allMatters: Matter[]; // New prop for historical comparison
  targetTaskId?: string | null;
  onUpdate: (updatedMatter: Matter) => void;
  onBack: () => void;
  onSaveTemplate: (matter: Matter) => void;
  onDeleteMatter: (id: string) => void;
  isTemplateMode?: boolean;
  theme?: 'light' | 'dark' | 'system';
  onThemeChange?: (t: 'light' | 'dark' | 'system') => void;
}

const uuid = () => Math.random().toString(36).substr(2, 9);

const MatterBoard: React.FC<Props> = ({ 
  matter, 
  allMatters,
  targetTaskId,
  onUpdate, 
  onBack, 
  onSaveTemplate,
  onDeleteMatter,
  isTemplateMode = false,
  theme,
  onThemeChange
}) => {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(matter.stages[0]?.id || null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // Mobile View Logic: 
  // If selectedTaskId is set, we show Task Detail (Overlay).
  // If not, we show Split View (Top: Tasks, Bottom: Timeline).
  // 'mobileView' state is technically redundant if we derive from selectedTaskId, 
  // but we keep it for explicitly controlling "Back" behavior if needed.
  
  // Title & Description Editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleVal, setEditTitleVal] = useState(matter.title);
  const [editDescVal, setEditDescVal] = useState(matter.type);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Add Stage State
  const [isAddingStage, setIsAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const newStageInputRef = useRef<HTMLInputElement>(null);

  // Edit Stage State
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageName, setEditingStageName] = useState('');

  // Edit Task Name State
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskName, setEditingTaskName] = useState('');

  // Handle Deep Linking
  useEffect(() => {
    if (targetTaskId) {
      for (const stage of matter.stages) {
        const found = stage.tasks.find(t => t.id === targetTaskId);
        if (found) {
          setSelectedStageId(stage.id);
          setSelectedTaskId(targetTaskId);
          break;
        }
      }
    }
  }, [targetTaskId, matter.id]); 

  // Sync title when matter updates
  useEffect(() => {
    setEditTitleVal(matter.title);
    setEditDescVal(matter.type);
  }, [matter.title, matter.type]);

  // Focus input when adding stage
  useEffect(() => {
    if (isAddingStage && newStageInputRef.current) {
      newStageInputRef.current.focus();
    }
  }, [isAddingStage]);

  // Derived state
  const activeStage = matter.stages.find(s => s.id === selectedStageId);
  const activeTask = activeStage?.tasks.find(t => t.id === selectedTaskId);

  // Mobile Navigation Helpers
  const goBack = () => {
      // If mobile and viewing a task, go back to overview
      if (window.innerWidth < 768 && selectedTaskId) {
          setSelectedTaskId(null);
          return;
      }
      onBack();
  };

  const saveHeaderInfo = () => {
    if (editTitleVal.trim()) {
      onUpdate({ 
          ...matter, 
          title: editTitleVal, 
          type: isTemplateMode ? editDescVal : matter.type, 
          lastUpdated: Date.now() 
      });
    } else {
      setEditTitleVal(matter.title);
    }
    setIsEditingTitle(false);
  };

  // ... (Export functions same as before) ...
  const exportMaterials = async (type: 'ALL' | 'REFERENCE' | 'DELIVERABLE') => {
      setIsExporting(true);
      setShowExportMenu(false);
      try {
          const zip = new JSZip();
          const matterFolder = zip.folder(matter.title.replace(/[\\/:*?"<>|]/g, '_')) || zip;

          for (const stage of matter.stages) {
              const stageFolder = matterFolder.folder(stage.title.replace(/[\\/:*?"<>|]/g, '_'));
              if (!stageFolder) continue;

              for (const task of stage.tasks) {
                  const taskFolder = stageFolder.folder(task.title.replace(/[\\/:*?"<>|]/g, '_'));
                  if (!taskFolder) continue;

                  let hasFiles = false;
                  for (const mat of task.materials) {
                      // Filter based on type
                      const isRef = mat.category === 'REFERENCE';
                      const shouldInclude = 
                          type === 'ALL' || 
                          (type === 'REFERENCE' && isRef) || 
                          (type === 'DELIVERABLE' && !isRef);

                      if (shouldInclude && mat.fileId) {
                          const file = await getFile(mat.fileId);
                          if (file) {
                              taskFolder.file(file.name, file);
                              hasFiles = true;
                          }
                      }
                  }
              }
          }

          const content = await zip.generateAsync({ type: "blob" });
          const url = window.URL.createObjectURL(content);
          const a = document.createElement("a");
          a.href = url;
          const typeLabel = type === 'REFERENCE' ? '_参考模板' : type === 'DELIVERABLE' ? '_交付产物' : '_全部材料';
          a.download = `${matter.title}${typeLabel}.zip`;
          a.click();
          window.URL.revokeObjectURL(url);
      } catch (e) {
          console.error("Export failed", e);
          alert("导出失败，请重试");
      } finally {
          setIsExporting(false);
      }
  };

  const validateDateAgainstMatter = (newDate: string) => {
    if (!matter.dueDate) return true;
    const ts = new Date(newDate).getTime();
    if (ts > matter.dueDate) {
       return confirm("设置的日期晚于事项总截止日期，确定要设置吗？");
    }
    return true;
  };

  // --- CRUD Operations ---
  const confirmAddStage = () => {
    if (!newStageName.trim()) {
      setIsAddingStage(false);
      return;
    }
    const newStage: Stage = { id: uuid(), title: newStageName.trim(), tasks: [] };
    const updatedStages = [...matter.stages, newStage];
    onUpdate({ ...matter, stages: updatedStages, lastUpdated: Date.now() });
    setNewStageName('');
    setIsAddingStage(false);
    setSelectedStageId(newStage.id);
  };

  const deleteStage = (stageId: string) => {
      if(!confirm("确定删除此阶段及其所有任务吗？")) return;
      const newStages = matter.stages.filter(s => s.id !== stageId);
      if (selectedStageId === stageId) {
          const deletedIndex = matter.stages.findIndex(s => s.id === stageId);
          const nextStage = newStages[Math.max(0, deletedIndex - 1)];
          setSelectedStageId(nextStage?.id || null);
      }
      onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
  };

  const updateStageDate = (stageId: string, dateStr: string) => {
      if (dateStr && !validateDateAgainstMatter(dateStr)) return;
      const ts = dateStr ? new Date(dateStr).getTime() : undefined;
      const newStages = matter.stages.map(s => s.id === stageId ? { ...s, dueDate: ts } : s);
      onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
  };

  const addTask = () => {
    if (!selectedStageId) return;
    const newTask: Task = {
      id: uuid(),
      title: '新任务',
      status: TaskStatus.PENDING,
      statusNote: '',
      statusUpdates: [],
      materials: [],
      lastUpdated: Date.now()
    };
    
    const newStages = matter.stages.map(s => {
      if (s.id === selectedStageId) {
        return { ...s, tasks: [...s.tasks, newTask] };
      }
      return s;
    });

    onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
    setSelectedTaskId(newTask.id); 
  };

  const deleteTask = (stageId: string, taskId: string) => {
      if (!confirm('确定删除此任务吗？')) return;
      const newStages = matter.stages.map(s => {
        if (s.id === stageId) {
          return { ...s, tasks: s.tasks.filter(t => t.id !== taskId) };
        }
        return s;
      });
      onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
      if (selectedTaskId === taskId) setSelectedTaskId(null);
  };

  const handleTaskUpdate = (updatedTask: Task) => {
    if (!selectedStageId) return;
    let dismissedIds = matter.dismissedAttentionIds || [];
    const currentTask = activeStage?.tasks.find(t => t.id === updatedTask.id);
    if (currentTask && currentTask.status !== updatedTask.status) {
        if (dismissedIds.includes(updatedTask.id)) {
            dismissedIds = dismissedIds.filter(id => id !== updatedTask.id);
        }
    }
    const newStages = matter.stages.map(s => {
      if (s.id === selectedStageId) {
        return { ...s, tasks: s.tasks.map(t => t.id === updatedTask.id ? updatedTask : t) };
      }
      return s;
    });
    onUpdate({ ...matter, stages: newStages, dismissedAttentionIds: dismissedIds, lastUpdated: Date.now() });
  };

  // Format date helper
  const formatDate = (ts?: number) => {
      if (!ts) return '';
      return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  };

  const getThemeIcon = () => {
    switch(theme) {
      case 'dark': return <Moon size={16} />;
      case 'light': return <Sun size={16} />;
      default: return <SunMoon size={16} />;
    }
  };

  // --- Rendering Helpers ---

  // Mobile Horizontal Stage Selector
  const renderMobileStageSelector = () => (
      <div className="flex overflow-x-auto gap-2 p-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 scrollbar-hide md:hidden shrink-0">
          {matter.stages.map((stage, idx) => (
              <button
                  key={stage.id}
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`
                      whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors border
                      ${selectedStageId === stage.id 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}
                  `}
              >
                  {idx + 1}. {stage.title}
              </button>
          ))}
          <button onClick={() => setIsAddingStage(true)} className="px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500"><Plus size={14}/></button>
      </div>
  );

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-white dark:bg-slate-950 overflow-hidden relative">
        
        {/* Header (Absolute) */}
        <header className="absolute top-0 left-0 right-0 z-50 h-16 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 px-4 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden flex-1 mr-4">
            <button onClick={goBack} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 transition-colors">
              <ArrowLeft size={18} />
            </button>
            <div className="h-5 w-[1px] bg-slate-300/50 dark:bg-slate-700"></div>
             
             {!isTemplateMode && (
                <div className="flex items-center gap-2 mr-2 shrink-0 group">
                     <div className="h-7 w-7 relative rounded-[22%] bg-black flex items-center justify-center overflow-hidden ring-1 ring-white/10">
                         <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
                         <span className="text-white font-bold text-[11px] tracking-tighter z-10 relative top-[1px]">Or</span>
                     </div>
                </div>
             )}
             
             {isEditingTitle ? (
                <input 
                  autoFocus
                  className="font-bold text-base text-slate-800 dark:text-slate-100 border-b border-blue-500 bg-transparent outline-none w-full"
                  value={editTitleVal}
                  onChange={(e) => setEditTitleVal(e.target.value)}
                  onBlur={saveHeaderInfo}
                  onKeyDown={(e) => e.key === 'Enter' && saveHeaderInfo()}
                />
              ) : (
                <div className="flex flex-col overflow-hidden" onClick={() => setIsEditingTitle(true)}>
                  <h1 className="font-bold text-slate-800 dark:text-slate-100 truncate text-base">{matter.title}</h1>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock size={10} /> {matter.dueDate ? `截止: ${new Date(matter.dueDate).toLocaleDateString()}` : '设置截止时间'}
                  </div>
                </div>
              )}
          </div>

          <div className="flex items-center gap-2">
             <button onClick={() => onThemeChange && onThemeChange(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                {getThemeIcon()}
            </button>
            {!isTemplateMode && (
                <div className="hidden md:block">
                    <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 rounded-md">
                        <Download size={14} /> 下载
                    </button>
                    {showExportMenu && (/* ... Export Menu same as before ... */
                        <div className="absolute right-4 top-14 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 z-50">
                             <button onClick={() => exportMaterials('ALL')} className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700">全部下载</button>
                        </div>
                    )}
                </div>
            )}
            <button onClick={() => onSaveTemplate(matter)} className="hidden md:block text-xs font-medium text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md">
                另存模板
            </button>
          </div>
        </header>

        {/* Content Container - Padded for Header */}
        <div className="flex-1 w-full overflow-hidden pt-16 flex relative">
            
            {/* 
                DESKTOP LAYOUT (md:flex) 
                - Column 1: Stages
                - Column 2: Tasks
                - Column 3: Details/Timeline
            */}
            <div className="hidden md:flex w-full h-full">
                {/* Col 1: Stages */}
                <div className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto">
                    <div className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider flex justify-between">
                        阶段
                        <button onClick={() => setIsAddingStage(true)}><Plus size={16}/></button>
                    </div>
                    <div className="px-2 space-y-1">
                        {matter.stages.map((stage, idx) => (
                            <div key={stage.id} onClick={() => { setSelectedStageId(stage.id); setSelectedTaskId(null); }} className={`p-2.5 rounded cursor-pointer text-sm font-medium ${selectedStageId === stage.id ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                                {idx + 1}. {stage.title}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Col 2: Tasks */}
                <div className="w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-y-auto">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur z-10">
                        <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{activeStage?.title}</span>
                        <button onClick={addTask} disabled={!selectedStageId} className="text-xs bg-slate-900 text-white px-2 py-1 rounded"><Plus size={12}/></button>
                    </div>
                    <div>
                        {activeStage?.tasks.map((task, idx) => (
                            <div key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`p-4 border-b border-slate-50 dark:border-slate-700 cursor-pointer ${selectedTaskId === task.id ? 'bg-blue-50/50 dark:bg-blue-900/20 border-l-4 border-l-blue-500' : 'hover:bg-slate-50 dark:hover:bg-slate-700 border-l-4 border-l-transparent'}`}>
                                <div className="flex justify-between mb-1"><StatusBadge status={task.status} /></div>
                                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{task.title}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Col 3: Details / Timeline */}
                <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
                    {activeTask ? (
                        <div className="h-full overflow-y-auto">
                            <TaskDetailPane task={activeTask} matterDueDate={matter.dueDate} onUpdate={handleTaskUpdate} onDelete={() => deleteTask(activeStage!.id, activeTask.id)} isTemplateMode={isTemplateMode} />
                        </div>
                    ) : (
                        <div className="h-full overflow-y-auto">
                            <JudgmentTimeline matter={matter} allMatters={allMatters} onUpdate={onUpdate} />
                        </div>
                    )}
                </div>
            </div>

            {/* 
                MOBILE LAYOUT (md:hidden)
                - Vertical Split: Top = Tasks, Bottom = Timeline
                - Overlay: Task Detail
            */}
            <div className="md:hidden w-full h-full flex flex-col">
                
                {/* TOP HALF: Stages + Tasks (Flex 1) */}
                <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
                    {renderMobileStageSelector()}
                    
                    {/* Task List Header */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            {activeStage ? `${activeStage.tasks.length} 个任务` : '请选择阶段'}
                        </span>
                        <button onClick={addTask} disabled={!selectedStageId} className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                            <Plus size={12} /> 任务
                        </button>
                    </div>

                    {/* Task List Content */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-50/30 dark:bg-slate-900">
                        {activeStage?.tasks.length === 0 && <div className="text-center py-8 text-slate-400 text-xs">暂无任务</div>}
                        {activeStage?.tasks.map((task) => (
                            <div 
                                key={task.id} 
                                onClick={() => setSelectedTaskId(task.id)}
                                className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm flex items-start gap-3 active:scale-[0.98] transition-transform"
                            >
                                <div className={`w-1 self-stretch rounded-full ${task.status === TaskStatus.COMPLETED ? 'bg-emerald-400' : task.status === TaskStatus.BLOCKED ? 'bg-amber-400' : 'bg-blue-400'}`}></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate">{task.title}</div>
                                        <StatusBadge status={task.status} className="scale-90 origin-right" />
                                    </div>
                                    <div className="text-xs text-slate-400 truncate">{task.description || '无描述'}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* BOTTOM HALF: Judgment Timeline (Fixed Height or Flex?) 
                    User requested: "Lower half Judgment Timeline" 
                    Let's give it about 40-45% of screen height.
                */}
                <div className="h-[45%] border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)] z-10 relative">
                    <div className="absolute top-[-12px] left-1/2 -translate-x-1/2 bg-slate-200 dark:bg-slate-700 w-10 h-1.5 rounded-full"></div>
                    <div className="flex-1 overflow-hidden">
                        {/* We reuse JudgmentTimeline but it needs to be scrollable internally */}
                        <JudgmentTimeline matter={matter} allMatters={allMatters} onUpdate={onUpdate} />
                    </div>
                </div>

                {/* TASK DETAIL OVERLAY (Full Screen) */}
                {selectedTaskId && activeTask && (
                    <div className="absolute inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col animate-slideUp">
                        {/* Custom Header for Detail View */}
                        <div className="h-14 border-b border-slate-100 dark:border-slate-800 flex items-center px-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur shrink-0">
                            <button onClick={() => setSelectedTaskId(null)} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full">
                                <ArrowLeft size={20} />
                            </button>
                            <span className="ml-2 font-bold text-slate-800 dark:text-white truncate flex-1">任务详情</span>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <TaskDetailPane 
                                task={activeTask} 
                                matterDueDate={matter.dueDate} 
                                onUpdate={handleTaskUpdate} 
                                onDelete={() => deleteTask(activeStage!.id, activeTask.id)} 
                                isTemplateMode={isTemplateMode} 
                            />
                        </div>
                    </div>
                )}
            </div>

        </div>
    </div>
  );
};

export default MatterBoard;