import React, { useState, useEffect, useRef } from 'react';
import { Matter, Task, Stage, TaskStatus, Material } from '../types';
import StatusBadge from './StatusBadge';
import TaskDetailPane from './TaskDetailPane';
import { 
  Plus, ArrowLeft, Edit2, Archive, Sparkles, 
  Trash2, LayoutTemplate, Briefcase, X, Check, Download, Save, ChevronRight, Calendar, Clock,
  Moon, Sun, Monitor, FileText, Package
} from 'lucide-react';
import { analyzeMatter } from '../services/geminiService';
import JSZip from 'jszip';
import { getFile } from '../services/storage';

interface Props {
  matter: Matter;
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
  
  // Mobile View State: 'STAGES' | 'TASKS' | 'DETAILS'
  const [mobileView, setMobileView] = useState<'STAGES' | 'TASKS' | 'DETAILS'>('STAGES');

  // Title & Description Editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleVal, setEditTitleVal] = useState(matter.title);
  const [editDescVal, setEditDescVal] = useState(matter.type);

  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  // Swipe Back Gesture State
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const MIN_SWIPE_DISTANCE = 50; // px

  // Handle Deep Linking & Mobile View Sync
  useEffect(() => {
    if (targetTaskId) {
      for (const stage of matter.stages) {
        const found = stage.tasks.find(t => t.id === targetTaskId);
        if (found) {
          setSelectedStageId(stage.id);
          setSelectedTaskId(targetTaskId);
          setMobileView('DETAILS');
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
  const goMobileBack = () => {
      // FIX: On Desktop (width >= 768px), always go back to Dashboard
      if (window.innerWidth >= 768) {
          onBack();
          return;
      }

      if (mobileView === 'DETAILS') {
          setMobileView('TASKS');
      } else if (mobileView === 'TASKS') {
          setMobileView('STAGES');
      } else {
          onBack();
      }
  };

  // --- Touch Handlers for Swipe Back ---
  const onTouchStart = (e: React.TouchEvent) => {
      setTouchEnd(null);
      if (e.targetTouches[0].clientX < 50) {
          setTouchStart(e.targetTouches[0].clientX);
      } else {
          setTouchStart(null);
      }
  };

  const onTouchMove = (e: React.TouchEvent) => {
      if (touchStart !== null) {
        setTouchEnd(e.targetTouches[0].clientX);
      }
  };

  const onTouchEnd = () => {
      if (!touchStart || !touchEnd) return;
      
      const distance = touchEnd - touchStart;
      const isLeftToRightSwipe = distance > MIN_SWIPE_DISTANCE;
      
      if (isLeftToRightSwipe) {
          goMobileBack();
      }
      setTouchStart(null);
      setTouchEnd(null);
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

  const triggerAI = async () => {
    setIsAnalyzing(true);
    const result = await analyzeMatter(matter);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

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
                  // Remove empty task folders if we want to be clean, but keeping structure is fine
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

  // --- Date Validation Helper ---
  const validateDateAgainstMatter = (newDate: string) => {
    if (!matter.dueDate) return true;
    const ts = new Date(newDate).getTime();
    if (ts > matter.dueDate) {
       return confirm("设置的日期晚于事项总截止日期，确定要设置吗？");
    }
    return true;
  };

  // --- Stage Logic ---

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
    setSelectedTaskId(null);
  };

  const deleteStage = (stageId: string) => {
      if(!confirm("确定删除此阶段及其所有任务吗？")) return;
      
      const newStages = matter.stages.filter(s => s.id !== stageId);
      
      if (selectedStageId === stageId) {
          const deletedIndex = matter.stages.findIndex(s => s.id === stageId);
          const nextStage = newStages[Math.max(0, deletedIndex - 1)];
          setSelectedStageId(nextStage?.id || null);
          setSelectedTaskId(null);
      }

      onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
  };

  const startEditingStage = (stage: Stage) => {
    setEditingStageId(stage.id);
    setEditingStageName(stage.title);
  };

  const saveStageName = () => {
    if (editingStageId && editingStageName.trim()) {
      const newStages = matter.stages.map(s => 
        s.id === editingStageId ? { ...s, title: editingStageName.trim() } : s
      );
      onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
    }
    setEditingStageId(null);
    setEditingStageName('');
  };

  const updateStageDate = (stageId: string, dateStr: string) => {
      if (dateStr && !validateDateAgainstMatter(dateStr)) return;

      const ts = dateStr ? new Date(dateStr).getTime() : undefined;
      const newStages = matter.stages.map(s => 
          s.id === stageId ? { ...s, dueDate: ts } : s
      );
      onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
  };

  // --- Task Logic ---

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
    setMobileView('DETAILS'); 
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
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
        setMobileView('TASKS'); 
      }
  };

  const startEditingTask = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTaskName(task.title);
  };

  const saveTaskName = () => {
    if (editingTaskId && editingTaskName.trim() && selectedStageId) {
        const newStages = matter.stages.map(s => {
            if (s.id === selectedStageId) {
                return {
                    ...s,
                    tasks: s.tasks.map(t => t.id === editingTaskId ? { ...t, title: editingTaskName.trim() } : t)
                }
            }
            return s;
        });
        onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
    }
    setEditingTaskId(null);
    setEditingTaskName('');
  };

  const handleTaskUpdate = (updatedTask: Task) => {
    if (!selectedStageId) return;
    const newStages = matter.stages.map(s => {
      if (s.id === selectedStageId) {
        return {
          ...s,
          tasks: s.tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
        };
      }
      return s;
    });
    onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
  };

  // Helper for conditional classes
  const getColVisibility = (view: 'STAGES' | 'TASKS' | 'DETAILS') => {
      if (mobileView === view) return 'flex';
      return 'hidden';
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
      default: return <Monitor size={16} />;
    }
  };

  // Shared Header Style for Liquid Glass Effect
  const columnHeaderClass = "flex-none h-14 flex items-center justify-between px-4 sticky top-0 z-20 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl backdrop-saturate-150 border-b border-slate-200/50 dark:border-slate-800/50 transition-colors";

  return (
    // Fixed: Use h-[100dvh] and flex-col for mobile scrolling fix.
    <div 
        className="h-[100dvh] w-full flex flex-col bg-white dark:bg-slate-950 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
    >
        
        {/* 
            ENHANCED STICKY FROSTED HEADER 
            - Unified liquid glass style
        */}
        <header className="flex-none z-50 h-16 
            bg-white/40 dark:bg-slate-900/40 
            backdrop-blur-xl backdrop-saturate-150 
            border-b border-slate-200/50 dark:border-slate-800/50 
            px-4 flex items-center justify-between shrink-0 transition-all">
          <div className="flex items-center gap-3 overflow-hidden flex-1 mr-4">
            <button 
              onClick={goMobileBack}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-500 dark:text-slate-400 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="h-5 w-[1px] bg-slate-300/50 dark:bg-slate-700"></div>
             
             {!isTemplateMode && (
                 // DESIGN UPDATE: Deep Black Squircle Logo
                <div className="flex items-center gap-2 mr-2 shrink-0 group">
                     <div className="h-7 w-7 relative rounded-[22%] bg-black shadow-lg shadow-black/20 flex items-center justify-center overflow-hidden ring-1 ring-white/10">
                         {/* Subtle gloss */}
                         <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
                         <span className="text-white font-bold text-[11px] tracking-tighter z-10 relative top-[1px]">Or</span>
                     </div>
                </div>
             )}
             
             {isEditingTitle ? (
                <div className="flex flex-col gap-1 w-full max-w-md">
                    <input 
                      autoFocus
                      className="font-bold text-base text-slate-800 dark:text-slate-100 border-b border-blue-500 focus:outline-none bg-transparent placeholder-slate-400"
                      value={editTitleVal}
                      onChange={(e) => setEditTitleVal(e.target.value)}
                      onBlur={saveHeaderInfo}
                      onKeyDown={(e) => e.key === 'Enter' && saveHeaderInfo()}
                      placeholder="模板名称"
                    />
                </div>
              ) : (
                <div 
                  className="group cursor-pointer overflow-hidden flex flex-col"
                  onClick={() => setIsEditingTitle(true)}
                >
                  <div className="flex items-center gap-2">
                      <h1 className="font-bold text-slate-800 dark:text-slate-100 truncate text-base">{matter.title}</h1>
                      <Edit2 size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  
                  {/* EDITABLE MATTER DUE DATE */}
                  <div className="relative group/date flex items-center gap-1 cursor-pointer w-fit mt-0.5">
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 hover:text-blue-600 transition-colors">
                            <Clock size={10} /> 
                            <span>{matter.dueDate ? `截止: ${new Date(matter.dueDate).toLocaleDateString()}` : '设置截止时间'}</span>
                        </div>
                        <input 
                            type="date"
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            value={matter.dueDate ? new Date(matter.dueDate).toISOString().split('T')[0] : ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                                const ts = e.target.value ? new Date(e.target.value).getTime() : undefined;
                                onUpdate({...matter, dueDate: ts, lastUpdated: Date.now()});
                            }}
                        />
                   </div>

                </div>
              )}
          </div>

          <div className="flex items-center gap-2">
             {/* Theme Toggle (Board) */}
             <button 
                onClick={() => {
                    if(onThemeChange) {
                        if(theme === 'system') onThemeChange('light');
                        else if(theme === 'light') onThemeChange('dark');
                        else onThemeChange('system');
                    }
                }}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors hidden md:block"
             >
                {getThemeIcon()}
            </button>
            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden md:block"></div>

            {!isTemplateMode && (
                <div className="relative hidden md:block">
                    <button 
                        onClick={() => setShowExportMenu(!showExportMenu)}
                        disabled={isExporting}
                        className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors"
                    >
                        <Download size={14} /> {isExporting ? '打包中...' : '下载材料'}
                    </button>
                    {showExportMenu && (
                         <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)}></div>
                            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-40 animate-slideDown">
                                <button onClick={() => exportMaterials('REFERENCE')} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                                    <FileText size={14} className="text-blue-500" /> 参考模板材料
                                </button>
                                <button onClick={() => exportMaterials('DELIVERABLE')} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                                    <Package size={14} className="text-emerald-500" /> 交付产物/成果
                                </button>
                                <div className="h-[1px] bg-slate-100 dark:bg-slate-700 my-1"></div>
                                <button onClick={() => exportMaterials('ALL')} className="w-full text-left px-4 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2">
                                    <Download size={14} className="text-slate-500" /> 全部下载
                                </button>
                            </div>
                         </>
                    )}
                    <div className="absolute right-[-8px] top-1/2 -translate-y-1/2 h-4 w-[1px] bg-slate-200 dark:bg-slate-700"></div>
                </div>
            )}

            {isTemplateMode ? (
                 <button 
                    onClick={() => onSaveTemplate(matter)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg hover:bg-blue-700 shadow-md transition-colors font-bold text-xs md:text-sm"
                 >
                    <Save size={16} /> <span className="hidden md:inline">保存模板</span>
                 </button>
            ) : (
                <button 
                    onClick={() => onSaveTemplate(matter)}
                    className="hidden md:flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-colors ml-4"
                    title="Save structure as template"
                >
                    <LayoutTemplate size={14} /> 另存为模板
                </button>
            )}

            {!isTemplateMode && (
                <>
                    <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden md:block"></div>
                    <button 
                        onClick={triggerAI}
                        disabled={isAnalyzing}
                        className="flex items-center gap-1 text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 px-3 py-1.5 rounded-md hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all"
                    >
                    <Sparkles size={14} /> <span className="hidden md:inline">{isAnalyzing ? '分析中...' : '智能简报'}</span>
                    </button>
                    <button 
                        onClick={() => {
                        const isArchived = !matter.archived;
                        onUpdate({...matter, archived: isArchived});
                        if(isArchived) onBack();
                        }}
                        className={`p-1.5 rounded-md transition-colors hidden md:block ${matter.archived ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                        title={matter.archived ? "已归档" : "归档"}
                    >
                        <Archive size={18} />
                    </button>
                </>
            )}
          </div>
        </header>

        {/* AI Panel */}
        {aiAnalysis && !isTemplateMode && (
            <div className="bg-indigo-600 text-white p-4 shrink-0 shadow-lg relative animate-slideDown z-30 flex-none">
              <div className="max-w-4xl mx-auto flex items-start gap-4">
                <Sparkles size={20} className="mt-1 text-indigo-300 shrink-0" />
                <div className="flex-1 text-sm whitespace-pre-wrap leading-relaxed opacity-95 font-light">
                   {aiAnalysis}
                </div>
                <button onClick={() => setAiAnalysis(null)} className="text-indigo-300 hover:text-white">✕</button>
              </div>
            </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative flex flex-col md:flex-row w-full">
            
            {/* Col 1: Stages */}
            <div className={`
                flex-1 md:flex-none w-full md:w-64 
                bg-slate-50 dark:bg-slate-900 
                border-r border-slate-200 dark:border-slate-800 
                flex-col overflow-y-auto overscroll-y-contain
                ${getColVisibility('STAGES')} md:flex
            `}>
                <div className={columnHeaderClass}>
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">阶段</span>
                    <button 
                      onClick={() => setIsAddingStage(true)} 
                      className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                      title="添加阶段"
                    >
                      <Plus size={16}/>
                    </button>
                </div>
                
                <div className="flex-1 px-2 py-2 space-y-0.5">
                    {matter.stages.map((stage, idx) => {
                        const isSelected = stage.id === selectedStageId;
                        const isEditing = editingStageId === stage.id;

                        return (
                            <div 
                                key={stage.id}
                                className={`
                                    group flex flex-col px-3 py-3 md:py-2.5 rounded-md cursor-pointer text-sm transition-colors relative
                                    ${isSelected 
                                        ? 'bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700' 
                                        : 'border border-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800/50 active:bg-slate-100 dark:active:bg-slate-800'}
                                `}
                                onClick={() => { 
                                    setSelectedStageId(stage.id); 
                                    setSelectedTaskId(null); 
                                    setMobileView('TASKS'); 
                                }}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                        <span className={`flex items-center justify-center w-5 h-5 rounded text-[10px] shrink-0 ${isSelected ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                            {idx + 1}
                                        </span>
                                        {isEditing ? (
                                            <input 
                                              autoFocus
                                              value={editingStageName}
                                              onChange={(e) => setEditingStageName(e.target.value)}
                                              onBlur={saveStageName}
                                              onKeyDown={(e) => e.key === 'Enter' && saveStageName()}
                                              onClick={(e) => e.stopPropagation()}
                                              className="w-full bg-white dark:bg-slate-700 border border-blue-400 rounded px-1 py-0.5 outline-none text-slate-800 dark:text-slate-100"
                                            />
                                        ) : (
                                            <span 
                                                className={`truncate font-medium ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    startEditingStage(stage);
                                                }}
                                            >{stage.title}</span>
                                        )}
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300 dark:text-slate-600 md:hidden" />
                                </div>
                                
                                {/* Stage Date Display/Input - ICON ONLY MODE */}
                                <div className="flex items-center mt-2 ml-7 relative group/date h-5">
                                    <div className="relative flex items-center justify-center p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                                        <Calendar size={14} className={`shrink-0 ${stage.dueDate ? 'text-blue-500 dark:text-blue-400' : 'text-slate-300 dark:text-slate-600 group-hover/date:text-blue-400'}`}/>
                                        <input 
                                            type="date"
                                            className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                                            value={stage.dueDate ? new Date(stage.dueDate).toISOString().split('T')[0] : ''}
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={(e) => updateStageDate(stage.id, e.target.value)}
                                            title={stage.dueDate ? `截止: ${new Date(stage.dueDate).toLocaleDateString()}` : "设置截止日期"}
                                        />
                                    </div>
                                    {stage.dueDate && (
                                        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1.5 pointer-events-none">
                                            {new Date(stage.dueDate).toLocaleDateString(undefined, {month:'numeric', day:'numeric'})}
                                        </span>
                                    )}
                                </div>

                                {!isEditing && (
                                    <div className="absolute right-2 top-2 hidden md:group-hover:flex items-center gap-1 bg-white/80 dark:bg-slate-700/80 rounded shadow-sm border border-slate-100 dark:border-slate-600">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); startEditingStage(stage); }}
                                            className="text-slate-400 hover:text-blue-600 p-1"
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); deleteStage(stage.id); }}
                                            className="text-slate-400 hover:text-red-500 p-1"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {isAddingStage && (
                      <div className="px-2 py-1 animate-fadeIn">
                        <div className="bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 rounded-md p-2 shadow-sm">
                          <input
                            ref={newStageInputRef}
                            className="w-full text-sm outline-none placeholder-slate-300 bg-transparent text-slate-800 dark:text-slate-100"
                            placeholder="输入阶段名称..."
                            value={newStageName}
                            onChange={(e) => setNewStageName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') confirmAddStage();
                              if (e.key === 'Escape') setIsAddingStage(false);
                            }}
                          />
                        </div>
                      </div>
                    )}
                </div>
            </div>

            {/* Col 2: Task List */}
            <div className={`
                flex-1 md:flex-none w-full md:w-80 
                bg-white dark:bg-slate-800 
                border-r border-slate-200 dark:border-slate-700 
                flex-col overflow-y-auto overscroll-y-contain
                ${getColVisibility('TASKS')} md:flex
            `}>
                <div className={columnHeaderClass}>
                    <h2 className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[160px]" title={activeStage?.title}>
                        {activeStage?.title || "选择阶段"}
                    </h2>
                    <button 
                        disabled={!selectedStageId}
                        onClick={addTask}
                        className="text-xs flex items-center gap-1 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-2.5 py-1.5 rounded hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors shadow-sm"
                    >
                        <Plus size={12} /> 新建
                    </button>
                </div>
                
                <div className="flex-1">
                    {!activeStage ? (
                        <div className="p-8 text-center text-slate-400 text-sm">请先选择左侧阶段</div>
                    ) : activeStage.tasks.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-slate-400 text-sm mb-4">此阶段暂无任务</p>
                            <button onClick={addTask} className="text-blue-600 dark:text-blue-400 text-sm hover:underline">创建一个？</button>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {activeStage.tasks.map((task, taskIdx) => {
                                const isSelected = task.id === selectedTaskId;
                                const isEditing = editingTaskId === task.id;

                                return (
                                    <div 
                                        key={task.id}
                                        onClick={() => {
                                            if (!isEditing) {
                                                setSelectedTaskId(task.id);
                                                setMobileView('DETAILS');
                                            }
                                        }}
                                        className={`
                                            group p-4 cursor-pointer transition-colors relative border-b border-slate-50 dark:border-slate-700
                                            ${isSelected 
                                                ? 'bg-blue-50/50 dark:bg-blue-900/20 !border-l-4 !border-l-blue-500' 
                                                : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border-l-4 border-transparent'}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-2 pr-4">
                                            <StatusBadge status={task.status} customText={task.customStatus} />
                                            
                                            {/* Due Date Indicator (Small) */}
                                            {task.dueDate && (
                                                <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                                                    <Calendar size={10} />
                                                    {formatDate(task.dueDate)}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-start gap-2">
                                            {/* Task Number */}
                                            <span className="text-xs font-mono text-slate-400 mt-0.5">{taskIdx + 1}.</span>
                                            
                                            {isEditing ? (
                                                <div className="pr-6 flex-1">
                                                    <input
                                                      autoFocus
                                                      value={editingTaskName}
                                                      onChange={(e) => setEditingTaskName(e.target.value)}
                                                      onBlur={saveTaskName}
                                                      onKeyDown={(e) => e.key === 'Enter' && saveTaskName()}
                                                      onClick={(e) => e.stopPropagation()}
                                                      className="w-full text-sm font-medium p-1 border border-blue-400 rounded outline-none bg-white dark:bg-slate-700 dark:text-slate-100"
                                                    />
                                                </div>
                                            ) : (
                                                <div 
                                                    className={`text-sm pr-6 flex-1 ${isSelected ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-slate-700 dark:text-slate-300'}`}
                                                    onDoubleClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        startEditingTask(task);
                                                    }}
                                                >
                                                    {task.title}
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Actions */}
                                        {!isEditing && (
                                            <div className="hidden md:flex absolute top-3 right-2 flex-col gap-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    type="button"
                                                    onMouseDown={(e) => e.stopPropagation()} 
                                                    onClick={(e) => { e.stopPropagation(); startEditingTask(task); }}
                                                    className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-slate-300 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 bg-white/50 dark:bg-slate-700/50"
                                                >
                                                    <Edit2 size={14} className="pointer-events-none" />
                                                </button>
                                                <button 
                                                    type="button"
                                                    onMouseDown={(e) => e.stopPropagation()} 
                                                    onClick={(e) => { e.stopPropagation(); deleteTask(activeStage.id, task.id); }}
                                                    className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-300 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 bg-white/50 dark:bg-slate-700/50"
                                                >
                                                    <Trash2 size={14} className="pointer-events-none" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Col 3: Task Details */}
            <div className={`
                flex-1 w-full bg-white dark:bg-slate-900 
                flex-col min-w-0 
                overflow-y-auto overscroll-y-contain
                ${getColVisibility('DETAILS')} md:flex
            `}>
                {activeTask ? (
                    <TaskDetailPane 
                        task={activeTask}
                        matterDueDate={matter.dueDate} 
                        onUpdate={handleTaskUpdate}
                        onDelete={() => {
                            if(activeStage) deleteTask(activeStage.id, activeTask.id);
                        }}
                        isTemplateMode={isTemplateMode}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700 bg-slate-50/30 dark:bg-slate-800/20">
                        <Briefcase size={48} className="mb-4 opacity-20" />
                        <p className="text-sm">选择一个任务开始处理</p>
                    </div>
                )}
            </div>

        </div>
    </div>
  );
};

export default MatterBoard;