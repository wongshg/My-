import React, { useState, useEffect, useRef } from 'react';
import { Matter, Task, Stage, TaskStatus } from '../types';
import StatusBadge from './StatusBadge';
import TaskDetailPane from './TaskDetailPane';
import { 
  Plus, ArrowLeft, Edit2, Archive, Sparkles, 
  Trash2, LayoutTemplate, Briefcase, X, Check, Download, Save, ChevronRight
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
}

const uuid = () => Math.random().toString(36).substr(2, 9);

const MatterBoard: React.FC<Props> = ({ 
  matter, 
  targetTaskId,
  onUpdate, 
  onBack, 
  onSaveTemplate,
  onDeleteMatter,
  isTemplateMode = false
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
      // Only record start if user is starting from the left edge (first 50px)
      // This allows general horizontal scrolling (if any) to work elsewhere
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

  const exportMaterials = async () => {
      setIsExporting(true);
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
                      if (mat.fileId) {
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
          a.download = `${matter.title}_材料.zip`;
          a.click();
          window.URL.revokeObjectURL(url);
      } catch (e) {
          console.error("Export failed", e);
          alert("导出失败，请重试");
      } finally {
          setIsExporting(false);
      }
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
    setMobileView('DETAILS'); // On mobile, jump to details immediately
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
        setMobileView('TASKS'); // Go back to list on mobile
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

  return (
    // Fixed: Use h-[100dvh] and flex-col for mobile scrolling fix.
    // Add touch handlers for Swipe Back
    <div 
        className="h-[100dvh] w-full flex flex-col bg-white overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
    >
        
        {/* Sticky Frosted Header - flex-none so it doesn't shrink/grow */}
        <header className="flex-none z-50 bg-white/75 backdrop-blur-2xl border-b border-slate-200/50 px-4 h-16 flex items-center justify-between shrink-0 supports-[backdrop-filter]:bg-white/60 transition-all">
          <div className="flex items-center gap-3 overflow-hidden flex-1 mr-4">
            <button 
              onClick={goMobileBack}
              className="p-1.5 hover:bg-slate-100 rounded-md text-slate-500 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="h-5 w-[1px] bg-slate-200"></div>
             
             {!isTemplateMode && (
                 // Brand: Orbit
                <div className="flex items-center gap-2 mr-2 shrink-0 group">
                     <div className="h-6 w-6 relative rounded-[22%] bg-gradient-to-br from-slate-700 to-black shadow-sm flex items-center justify-center overflow-hidden ring-1 ring-white/20">
                         <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent"></div>
                         <span className="text-white font-bold text-[10px] tracking-tighter z-10">Or</span>
                     </div>
                </div>
             )}
             
             {isEditingTitle ? (
                <div className="flex flex-col gap-1 w-full max-w-md">
                    <input 
                      autoFocus
                      // Updated for Light Header
                      className="font-bold text-base text-slate-800 border-b border-blue-500 focus:outline-none bg-transparent placeholder-slate-400"
                      value={editTitleVal}
                      onChange={(e) => setEditTitleVal(e.target.value)}
                      onBlur={saveHeaderInfo}
                      onKeyDown={(e) => e.key === 'Enter' && saveHeaderInfo()}
                      placeholder="模板名称"
                    />
                    {isTemplateMode && (
                        <input 
                          className="text-xs text-slate-500 border-b border-blue-300/50 focus:outline-none bg-transparent"
                          value={editDescVal}
                          onChange={(e) => setEditDescVal(e.target.value)}
                          onBlur={saveHeaderInfo}
                          onKeyDown={(e) => e.key === 'Enter' && saveHeaderInfo()}
                          placeholder="模板描述/适用范围"
                        />
                    )}
                </div>
              ) : (
                <div 
                  className="group cursor-pointer overflow-hidden flex flex-col"
                  onClick={() => setIsEditingTitle(true)}
                >
                  <div className="flex items-center gap-2">
                      <h1 className="font-bold text-slate-800 truncate text-base">{matter.title}</h1>
                      <Edit2 size={12} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  {isTemplateMode && (
                      <div className="text-xs text-slate-400 truncate max-w-md">{matter.type || "点击添加描述"}</div>
                  )}
                </div>
              )}
          </div>

          {/* Update: Button colors for Light Header */}
          <div className="flex items-center gap-2">
            {!isTemplateMode && (
                <>
                    <button 
                        onClick={exportMaterials}
                        disabled={isExporting}
                        className="hidden md:flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 px-3 py-1.5 hover:bg-slate-50 rounded-md transition-colors"
                    >
                        <Download size={14} /> {isExporting ? '打包中...' : '下载材料'}
                    </button>
                    <div className="h-4 w-[1px] bg-slate-200 hidden md:block"></div>
                </>
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
                    className="hidden md:flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-blue-600 px-3 py-1.5 hover:bg-slate-50 rounded-md transition-colors"
                    title="Save structure as template"
                >
                    <LayoutTemplate size={14} /> 另存为模板
                </button>
            )}

            {!isTemplateMode && (
                <>
                    <div className="h-4 w-[1px] bg-slate-200 hidden md:block"></div>
                    <button 
                        onClick={triggerAI}
                        disabled={isAnalyzing}
                        className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-md hover:bg-indigo-100 transition-all"
                    >
                    <Sparkles size={14} /> <span className="hidden md:inline">{isAnalyzing ? '分析中...' : '智能简报'}</span>
                    </button>
                    <button 
                        onClick={() => {
                        const isArchived = !matter.archived;
                        onUpdate({...matter, archived: isArchived});
                        if(isArchived) onBack();
                        }}
                        className={`p-1.5 rounded-md transition-colors hidden md:block ${matter.archived ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
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

        {/* Content Area - Flex 1 to fill remaining space, internal scrolling */}
        <div className="flex-1 overflow-hidden relative flex flex-col md:flex-row w-full">
            
            {/* Col 1: Stages - Mobile Full Screen / Desktop Sidebar */}
            <div className={`
                flex-1 md:flex-none w-full md:w-64 bg-slate-50 border-r border-slate-200 flex-col 
                overflow-y-auto overscroll-y-contain
                ${getColVisibility('STAGES')} md:flex
            `}>
                <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50 sticky top-0 md:static z-10">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">阶段</span>
                    <button 
                      onClick={() => setIsAddingStage(true)} 
                      className="text-slate-500 hover:text-blue-600 p-1.5 rounded hover:bg-slate-200 transition-colors"
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
                                    group flex items-center justify-between px-3 py-3 md:py-2.5 rounded-md cursor-pointer text-sm transition-colors relative
                                    ${isSelected ? 'bg-white shadow-sm text-blue-700 font-medium' : 'text-slate-600 md:hover:bg-slate-200/50 active:bg-slate-100'}
                                `}
                                onClick={() => { 
                                    setSelectedStageId(stage.id); 
                                    setSelectedTaskId(null); 
                                    setMobileView('TASKS'); // Switch to next view on mobile
                                }}
                            >
                                <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                    <span className={`flex items-center justify-center w-5 h-5 rounded text-[10px] shrink-0 ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
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
                                          className="w-full bg-white border border-blue-400 rounded px-1 py-0.5 outline-none text-slate-800"
                                        />
                                    ) : (
                                        <span 
                                            className="truncate" 
                                            onDoubleClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                startEditingStage(stage);
                                            }}
                                            title="双击重命名"
                                        >{stage.title}</span>
                                    )}
                                </div>
                                
                                <ChevronRight size={16} className="text-slate-300 md:hidden" />

                                {!isEditing && (
                                    <div className="flex items-center gap-1 z-10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-white/50 rounded ml-1">
                                        <button 
                                            type="button"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => { 
                                                e.preventDefault();
                                                e.stopPropagation(); 
                                                startEditingStage(stage); 
                                            }}
                                            className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50"
                                            title="重命名"
                                        >
                                            <Edit2 size={14} className="pointer-events-none" />
                                        </button>
                                        <button 
                                            type="button"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={(e) => { 
                                                e.preventDefault();
                                                e.stopPropagation(); 
                                                deleteStage(stage.id); 
                                            }}
                                            className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50"
                                            title="删除阶段"
                                        >
                                            <Trash2 size={14} className="pointer-events-none" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })}

                    {/* Add Stage Input */}
                    {isAddingStage && (
                      <div className="px-2 py-1 animate-fadeIn">
                        <div className="bg-white border border-blue-300 rounded-md p-2 shadow-sm">
                          <input
                            ref={newStageInputRef}
                            className="w-full text-sm outline-none placeholder-slate-300"
                            placeholder="输入阶段名称..."
                            value={newStageName}
                            onChange={(e) => setNewStageName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') confirmAddStage();
                              if (e.key === 'Escape') setIsAddingStage(false);
                            }}
                          />
                          <div className="flex justify-end gap-1 mt-2">
                            <button onClick={() => setIsAddingStage(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded">
                              <X size={14} />
                            </button>
                            <button onClick={confirmAddStage} className="p-1 text-white bg-blue-500 hover:bg-blue-600 rounded">
                              <Check size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
            </div>

            {/* Col 2: Task List */}
            <div className={`
                flex-1 md:flex-none w-full md:w-80 bg-white border-r border-slate-200 flex-col 
                overflow-y-auto overscroll-y-contain
                ${getColVisibility('TASKS')} md:flex
            `}>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between h-[60px] shrink-0 bg-white z-10 sticky top-0 md:static">
                    <h2 className="font-bold text-slate-800 truncate max-w-[160px]" title={activeStage?.title}>
                        {activeStage?.title || "选择阶段"}
                    </h2>
                    <button 
                        disabled={!selectedStageId}
                        onClick={addTask}
                        className="text-xs flex items-center gap-1 bg-slate-900 text-white px-2.5 py-1.5 rounded hover:bg-slate-700 disabled:opacity-50 transition-colors shadow-sm"
                    >
                        <Plus size={12} /> 新建任务
                    </button>
                </div>
                
                <div className="flex-1">
                    {!activeStage ? (
                        <div className="p-8 text-center text-slate-400 text-sm">请先选择左侧阶段</div>
                    ) : activeStage.tasks.length === 0 ? (
                        <div className="p-8 text-center">
                            <p className="text-slate-400 text-sm mb-4">此阶段暂无任务</p>
                            <button onClick={addTask} className="text-blue-600 text-sm hover:underline">创建一个？</button>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-50">
                            {activeStage.tasks.map(task => {
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
                                            group p-4 cursor-pointer transition-colors border-l-2 relative
                                            ${isSelected ? 'bg-blue-50/30 border-blue-500' : 'bg-white hover:bg-slate-50 border-transparent'}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-2 pr-4">
                                            <StatusBadge status={task.status} customText={task.customStatus} />
                                            {task.materials.some(m => !m.isReady) && !isTemplateMode && <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1"></div>}
                                        </div>
                                        
                                        {isEditing ? (
                                            <div className="pr-6">
                                                <input
                                                  autoFocus
                                                  value={editingTaskName}
                                                  onChange={(e) => setEditingTaskName(e.target.value)}
                                                  onBlur={saveTaskName}
                                                  onKeyDown={(e) => e.key === 'Enter' && saveTaskName()}
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="w-full text-sm font-medium p-1 border border-blue-400 rounded outline-none"
                                                />
                                            </div>
                                        ) : (
                                            <div 
                                                className={`text-sm pr-6 ${isSelected ? 'text-slate-900 font-medium' : 'text-slate-700'}`}
                                                onDoubleClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    startEditingTask(task);
                                                }}
                                                title="双击重命名"
                                            >
                                                {task.title}
                                            </div>
                                        )}
                                        
                                        {/* Actions */}
                                        {!isEditing && (
                                            <div className="hidden md:flex absolute top-3 right-2 flex-col gap-1 z-50 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    type="button"
                                                    onMouseDown={(e) => e.stopPropagation()} 
                                                    onClick={(e) => { 
                                                        e.preventDefault();
                                                        e.stopPropagation(); 
                                                        startEditingTask(task); 
                                                    }}
                                                    className="p-1 rounded hover:bg-blue-100 text-slate-300 hover:text-blue-600 bg-white/50"
                                                    title="重命名任务"
                                                >
                                                    <Edit2 size={14} className="pointer-events-none" />
                                                </button>
                                                <button 
                                                    type="button"
                                                    onMouseDown={(e) => e.stopPropagation()} 
                                                    onClick={(e) => { 
                                                        e.preventDefault();
                                                        e.stopPropagation(); 
                                                        deleteTask(activeStage.id, task.id); 
                                                    }}
                                                    className="p-1 rounded hover:bg-red-100 text-slate-300 hover:text-red-600 bg-white/50"
                                                    title="删除任务"
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
                flex-1 w-full bg-white flex-col min-w-0 
                overflow-y-auto overscroll-y-contain
                ${getColVisibility('DETAILS')} md:flex
            `}>
                {activeTask ? (
                    <TaskDetailPane 
                        // Re-rendering controlled by passing full task object
                        task={activeTask}
                        onUpdate={handleTaskUpdate}
                        onDelete={() => {
                            if(activeStage) deleteTask(activeStage.id, activeTask.id);
                        }}
                    />
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300 bg-slate-50/30">
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