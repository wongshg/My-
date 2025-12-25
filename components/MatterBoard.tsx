import React, { useState, useEffect, useRef } from 'react';
import { Matter, Task, Stage, TaskStatus, Material } from '../types';
import StatusBadge from './StatusBadge';
import TaskDetailPane from './TaskDetailPane';
import JudgmentTimeline from './JudgmentTimeline';
import { 
  Plus, ArrowLeft, Edit2, Archive, 
  Trash2, LayoutTemplate, Briefcase, X, Check, Download, Save, ChevronRight, Calendar, Clock,
  Moon, Sun, Monitor, FileText, Package, LayoutDashboard, SunMoon, MoreHorizontal, GripHorizontal, GripVertical
} from 'lucide-react';
import { analyzeMatter } from '../services/geminiService';
import JSZip from 'jszip';
import { getFile } from '../services/storage';

interface Props {
  matter: Matter;
  allMatters: Matter[];
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
  
  // Mobile Split State (Top Panel Height in vh)
  const [topPanelHeightVh, setTopPanelHeightVh] = useState(40); // Default 40vh for top panel
  const resizeRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

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

  // Drag and Drop State
  const [dragItem, setDragItem] = useState<{ type: 'STAGE' | 'TASK', id: string, stageId?: string } | null>(null);

  // Robust Scroll Reset
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [matter.id]);

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

  useEffect(() => {
    setEditTitleVal(matter.title);
    setEditDescVal(matter.type);
  }, [matter.title, matter.type]);

  useEffect(() => {
    if (isAddingStage && newStageInputRef.current) {
      newStageInputRef.current.focus();
    }
  }, [isAddingStage]);

  // Resize Logic for Mobile (Touch)
  const handleResizeStart = (e: React.TouchEvent | React.MouseEvent) => {
      setIsResizing(true);
      document.body.style.userSelect = 'none';
  };

  const handleResizeMove = (e: React.TouchEvent | React.MouseEvent) => {
      if (!isResizing) return;
      
      let clientY;
      if ('touches' in e) {
          clientY = e.touches[0].clientY;
      } else {
          clientY = e.clientY;
      }

      const headerOffset = 64; 
      const rawHeight = clientY - headerOffset;
      const vh = (rawHeight / window.innerHeight) * 100;

      if (vh > 20 && vh < 70) {
          setTopPanelHeightVh(vh);
      }
  };

  const handleResizeEnd = () => {
      setIsResizing(false);
      document.body.style.userSelect = '';
  };

  useEffect(() => {
      if (isResizing) {
          window.addEventListener('mousemove', handleResizeMove as any);
          window.addEventListener('mouseup', handleResizeEnd);
          window.addEventListener('touchmove', handleResizeMove as any);
          window.addEventListener('touchend', handleResizeEnd);
      } else {
          window.removeEventListener('mousemove', handleResizeMove as any);
          window.removeEventListener('mouseup', handleResizeEnd);
          window.removeEventListener('touchmove', handleResizeMove as any);
          window.removeEventListener('touchend', handleResizeEnd);
      }
      return () => {
          window.removeEventListener('mousemove', handleResizeMove as any);
          window.removeEventListener('mouseup', handleResizeEnd);
          window.removeEventListener('touchmove', handleResizeMove as any);
          window.removeEventListener('touchend', handleResizeEnd);
      }
  }, [isResizing]);


  const activeStage = matter.stages.find(s => s.id === selectedStageId);
  const activeTask = activeStage?.tasks.find(t => t.id === selectedTaskId);

  const goBack = () => {
      if (isTemplateMode && isEditingTitle) {
          if (!confirm("您有未保存的标题修改，确定要退出吗？")) return;
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

  const handleDragStart = (e: React.DragEvent, type: 'STAGE' | 'TASK', id: string, stageId?: string) => {
    setDragItem({ type, id, stageId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetType: 'STAGE' | 'TASK', targetId: string, targetStageId?: string) => {
    e.preventDefault();
    if (!dragItem) return;

    // STAGE REORDERING
    if (dragItem.type === 'STAGE' && targetType === 'STAGE' && dragItem.id !== targetId) {
        const oldIndex = matter.stages.findIndex(s => s.id === dragItem.id);
        const newIndex = matter.stages.findIndex(s => s.id === targetId);
        
        if (oldIndex === -1 || newIndex === -1) return;

        const newStages = [...matter.stages];
        const [movedStage] = newStages.splice(oldIndex, 1);
        newStages.splice(newIndex, 0, movedStage);
        
        onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
    }

    // TASK REORDERING
    if (dragItem.type === 'TASK' && targetType === 'TASK' && dragItem.id !== targetId && dragItem.stageId && targetStageId) {
         const sourceStageIndex = matter.stages.findIndex(s => s.id === dragItem.stageId);
         const targetStageIndex = matter.stages.findIndex(s => s.id === targetStageId);
         
         if (sourceStageIndex === -1 || targetStageIndex === -1) return;

         const newStages = [...matter.stages];
         
         // Remove from source
         const sourceStage = newStages[sourceStageIndex];
         const taskIndex = sourceStage.tasks.findIndex(t => t.id === dragItem.id);
         if (taskIndex === -1) return;
         
         const [movedTask] = sourceStage.tasks.splice(taskIndex, 1);

         // Add to target
         const targetStage = newStages[targetStageIndex]; 
         
         if (sourceStageIndex === targetStageIndex) {
            const targetTaskIndex = sourceStage.tasks.findIndex(t => t.id === targetId);
            sourceStage.tasks.splice(targetTaskIndex, 0, movedTask);
         } else {
             const targetTaskIndex = targetStage.tasks.findIndex(t => t.id === targetId);
             targetStage.tasks.splice(targetTaskIndex, 0, movedTask);
         }

         onUpdate({ ...matter, stages: newStages, lastUpdated: Date.now() });
    }
    
    setDragItem(null);
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

  const getThemeIcon = () => {
    switch(theme) {
      case 'dark': return <Moon size={16} />;
      case 'light': return <Sun size={16} />;
      default: return <SunMoon size={16} />;
    }
  };

  const renderMobileStageSelector = () => (
      <div className="flex overflow-x-auto gap-2 p-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 scrollbar-hide shrink-0 shadow-sm">
          {matter.stages.map((stage, idx) => {
              const isSelected = selectedStageId === stage.id;
              const isEditing = editingStageId === stage.id;

              if (isEditing) {
                  return (
                      <input 
                          key={stage.id}
                          autoFocus
                          value={editingStageName}
                          onChange={(e) => setEditingStageName(e.target.value)}
                          onBlur={saveStageName}
                          onKeyDown={(e) => e.key === 'Enter' && saveStageName()}
                          className="px-3 py-1.5 rounded-full text-xs font-medium border border-blue-600 bg-white text-slate-800 outline-none min-w-[100px]"
                      />
                  );
              }

              return (
                  <button
                      key={stage.id}
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`
                          whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-colors border flex items-center gap-1.5
                          ${isSelected 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}
                      `}
                  >
                      {idx + 1}. {stage.title}
                      {isSelected && (
                          <span 
                            onClick={(e) => {
                                e.stopPropagation();
                                startEditingStage(stage);
                            }}
                            className="bg-blue-500 rounded-full p-0.5 hover:bg-blue-400"
                          >
                             <Edit2 size={10} />
                          </span>
                      )}
                  </button>
              );
          })}
          
          {isAddingStage ? (
             <input 
                autoFocus
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                onBlur={() => {
                    if (newStageName.trim()) confirmAddStage();
                    else setIsAddingStage(false);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmAddStage();
                    if (e.key === 'Escape') setIsAddingStage(false);
                }}
                placeholder="新阶段名称"
                className="px-3 py-1.5 rounded-full text-xs font-medium border border-blue-400 bg-white outline-none min-w-[100px]"
             />
          ) : (
             <button onClick={() => setIsAddingStage(true)} className="px-2 py-1 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500"><Plus size={14}/></button>
          )}
      </div>
  );

  return (
    <>
    {/* 
        DESKTOP LAYOUT (Hidden on mobile)
        Fixed height, no body scroll.
    */}
    <div className="hidden md:flex w-full h-screen flex-col bg-white dark:bg-slate-950 overflow-hidden">
        {/* Desktop Header */}
        <header className="h-16 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 px-4 flex items-center justify-between shrink-0 relative z-50">
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
                      {isTemplateMode ? (
                          <span className="text-blue-500 font-medium">模板编辑模式</span>
                      ) : (
                          <><Clock size={10} /> {matter.dueDate ? `截止: ${new Date(matter.dueDate).toLocaleDateString()}` : '设置截止时间'}</>
                      )}
                  </div>
                </div>
              )}
          </div>

          <div className="flex items-center gap-2">
             <button onClick={() => onThemeChange && onThemeChange(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                {getThemeIcon()}
            </button>

             {!isTemplateMode && (
                <div className="hidden md:block relative z-50">
                    <button onClick={() => setShowExportMenu(!showExportMenu)} className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 px-3 py-1.5 rounded-md">
                        <Download size={14} /> 下载
                    </button>
                    {showExportMenu && (
                        <div className="absolute right-0 top-10 w-32 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 z-50 flex flex-col py-1 animate-fadeIn">
                             <button onClick={() => exportMaterials('ALL')} className="text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">全部下载</button>
                             <div className="h-[1px] bg-slate-100 dark:bg-slate-700 mx-2"></div>
                             <button onClick={() => exportMaterials('REFERENCE')} className="text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">仅参考模板</button>
                             <button onClick={() => exportMaterials('DELIVERABLE')} className="text-left px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">仅交付产物</button>
                        </div>
                    )}
                </div>
            )}
            
            {isTemplateMode ? (
                <button 
                  onClick={() => onSaveTemplate(matter)} 
                  className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-md shadow-sm transition-colors"
                >
                    <Save size={14} /> 保存修改
                </button>
            ) : (
                <button onClick={() => onSaveTemplate(matter)} className="hidden md:block text-xs font-medium text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md">
                    另存模板
                </button>
            )}
            
            {!isTemplateMode && (
                <>
                    <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden md:block"></div>
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

        {/* Desktop Body */}
        <div className="flex-1 w-full overflow-hidden flex relative">
            {/* Col 1: Stages */}
                <div className="w-64 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto">
                    <div className="p-4 font-bold text-xs text-slate-400 uppercase tracking-wider flex justify-between">
                        阶段
                        <button onClick={() => setIsAddingStage(true)}><Plus size={16}/></button>
                    </div>
                    <div className="px-2 space-y-1 pb-10">
                        {matter.stages.map((stage, idx) => {
                            const isEditing = editingStageId === stage.id;
                            return (
                                <div 
                                    key={stage.id} 
                                    draggable={!isEditing}
                                    onDragStart={(e) => handleDragStart(e, 'STAGE', stage.id)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'STAGE', stage.id)}
                                    onClick={() => { setSelectedStageId(stage.id); setSelectedTaskId(null); }} 
                                    className={`group p-2.5 rounded cursor-pointer text-sm font-medium relative flex items-center justify-between transition-all border
                                        ${selectedStageId === stage.id ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600 border-transparent' : 'border-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}
                                        ${dragItem?.id === stage.id ? 'opacity-50 border-dashed border-blue-400' : ''}
                                    `}
                                >
                                    <div className="flex-1 min-w-0 truncate flex items-center gap-2">
                                        <GripVertical size={12} className="text-slate-300 dark:text-slate-600 cursor-move opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <span className="opacity-50 text-xs">{idx + 1}.</span>
                                        {isEditing ? (
                                            <input 
                                                autoFocus
                                                className="w-full bg-white dark:bg-slate-700 border border-blue-400 rounded px-1 py-0.5 outline-none text-slate-800 dark:text-slate-100"
                                                value={editingStageName}
                                                onChange={(e) => setEditingStageName(e.target.value)}
                                                onBlur={saveStageName}
                                                onKeyDown={(e) => e.key === 'Enter' && saveStageName()}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span onDoubleClick={(e) => { e.stopPropagation(); startEditingStage(stage); }}>{stage.title}</span>
                                        )}
                                    </div>
                                    {!isEditing && (
                                        <div className="hidden group-hover:flex items-center gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); startEditingStage(stage); }} className="p-1 hover:text-blue-500"><Edit2 size={12}/></button>
                                            <button onClick={(e) => { e.stopPropagation(); deleteStage(stage.id); }} className="p-1 hover:text-red-500"><Trash2 size={12}/></button>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                        {isAddingStage && (
                            <div className="p-2">
                                <input 
                                    ref={newStageInputRef}
                                    className="w-full bg-white dark:bg-slate-800 border border-blue-400 rounded px-2 py-1 text-sm outline-none"
                                    placeholder="输入阶段名称"
                                    value={newStageName}
                                    onChange={(e) => setNewStageName(e.target.value)}
                                    onKeyDown={(e) => { if(e.key === 'Enter') confirmAddStage(); if(e.key === 'Escape') setIsAddingStage(false); }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Col 2: Tasks */}
                <div className="w-80 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col overflow-y-auto">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/90 dark:bg-slate-800/90 backdrop-blur z-10">
                        <span className="font-bold text-slate-800 dark:text-slate-100 truncate">{activeStage?.title}</span>
                        <button onClick={addTask} disabled={!selectedStageId} className="text-xs bg-slate-900 text-white px-2 py-1 rounded"><Plus size={12}/></button>
                    </div>
                    <div className="pb-10">
                        {activeStage?.tasks.map((task, idx) => {
                            const isEditing = editingTaskId === task.id;
                            return (
                                <div 
                                    key={task.id} 
                                    draggable={!isEditing}
                                    onDragStart={(e) => handleDragStart(e, 'TASK', task.id, activeStage.id)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, 'TASK', task.id, activeStage.id)}
                                    onClick={() => setSelectedTaskId(task.id)} 
                                    className={`group p-4 border-b border-slate-50 dark:border-slate-700 cursor-pointer relative transition-all flex items-center justify-between
                                        ${selectedTaskId === task.id ? 'bg-blue-50/50 dark:bg-blue-900/20 border-l-4 border-l-blue-500' : 'hover:bg-slate-50 dark:hover:bg-slate-700 border-l-4 border-l-transparent'}
                                        ${dragItem?.id === task.id ? 'opacity-50 bg-blue-50' : ''}
                                    `}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between mb-1 items-start">
                                            <div className="flex items-center gap-2">
                                                <GripVertical size={12} className="text-slate-300 dark:text-slate-600 cursor-move opacity-0 group-hover:opacity-100 transition-opacity -ml-1" />
                                                <StatusBadge status={task.status} />
                                            </div>
                                        </div>
                                        {isEditing ? (
                                            <input
                                                autoFocus
                                                className="w-full bg-white dark:bg-slate-700 border border-blue-400 rounded px-1 py-0.5 outline-none text-slate-800 dark:text-slate-100 text-sm font-medium"
                                                value={editingTaskName}
                                                onChange={(e) => setEditingTaskName(e.target.value)}
                                                onBlur={saveTaskName}
                                                onKeyDown={(e) => e.key === 'Enter' && saveTaskName()}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 pr-2" onDoubleClick={(e) => { e.stopPropagation(); startEditingTask(task); }}>
                                                {task.title}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {!isEditing && (
                                        <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                                            <button onClick={(e) => { e.stopPropagation(); startEditingTask(task); }} className="p-1 hover:text-blue-500"><Edit2 size={12}/></button>
                                            <button onClick={(e) => { e.stopPropagation(); deleteTask(activeStage!.id, task.id); }} className="p-1 hover:text-red-500"><Trash2 size={12}/></button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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
    </div>

    {/* 
        MOBILE LAYOUT (Hidden on desktop)
        Refactored to FIXED HEIGHT FLEX LAYOUT to solve scroll chaining issues.
        Structure: Container(h-screen) -> Header(fixed) -> TopPanel(scroll) -> Resize(fixed) -> Timeline(scroll flex-1)
    */}
    <div className="md:hidden w-full h-screen flex flex-col bg-white dark:bg-slate-950 overflow-hidden fixed inset-0">
        
        {/* Header (Shrink-0) */}
        <header className="shrink-0 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 px-4 flex items-center justify-between z-50">
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
                      {isTemplateMode ? (
                          <span className="text-blue-500 font-medium">模板编辑模式</span>
                      ) : (
                          <><Clock size={10} /> {matter.dueDate ? `截止: ${new Date(matter.dueDate).toLocaleDateString()}` : '设置截止时间'}</>
                      )}
                  </div>
                </div>
              )}
          </div>

          <div className="flex items-center gap-2">
             <button onClick={() => onThemeChange && onThemeChange(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
                {getThemeIcon()}
            </button>
            
            {isTemplateMode ? (
                <button 
                  onClick={() => onSaveTemplate(matter)} 
                  className="p-2 text-blue-600 dark:text-blue-400 font-bold text-xs bg-blue-50 dark:bg-blue-900/20 rounded-lg"
                >
                    <Save size={18} />
                </button>
            ) : (
                <button onClick={() => onSaveTemplate(matter)} className="hidden md:block text-xs font-medium text-slate-600 dark:text-slate-300 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md">
                    另存模板
                </button>
            )}
          </div>
        </header>

        {/* Top Panel (Stages + Tasks) - Independent Scroll */}
        <div 
            className="shrink-0 bg-white/95 dark:bg-slate-950/95 shadow-sm overflow-y-auto flex flex-col"
            style={{ height: `${topPanelHeightVh}vh` }}
        >
                {renderMobileStageSelector()}
                
                {/* Task List Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                        {activeStage ? `${activeStage.tasks.length} 个任务` : '请选择阶段'}
                    </span>
                    <button onClick={addTask} disabled={!selectedStageId} className="flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                        <Plus size={12} /> 任务
                    </button>
                </div>

                {/* Task List Content */}
                <div className="p-2 space-y-2 bg-slate-50/30 dark:bg-slate-900 flex-1">
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

        {/* Resize Handle (Fixed) */}
        <div 
            ref={resizeRef}
            className="shrink-0 z-40 h-5 bg-slate-50 dark:bg-slate-900 border-t border-b border-slate-200 dark:border-slate-800 flex items-center justify-center cursor-row-resize touch-none shadow-sm"
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
        >
            <GripHorizontal size={16} className="text-slate-400" />
        </div>

        {/* Bottom Panel (Timeline) - Independent Scroll (Flex-1) */}
        <div className="flex-1 overflow-y-auto bg-transparent relative z-0 pb-[calc(2rem+env(safe-area-inset-bottom))]">
             <JudgmentTimeline matter={matter} allMatters={allMatters} onUpdate={onUpdate} />
        </div>

        {/* TASK DETAIL OVERLAY (Full Screen) */}
        {selectedTaskId && activeTask && (
            <div className="fixed inset-0 z-[60] bg-white dark:bg-slate-950 flex flex-col animate-slideUp w-full h-[100vh] overflow-hidden">
                {/* Custom Header for Detail View */}
                <div className="h-14 border-b border-slate-100 dark:border-slate-800 flex items-center px-4 bg-white/95 dark:bg-slate-950/95 backdrop-blur shrink-0 pt-[env(safe-area-inset-top)]">
                    <button onClick={() => setSelectedTaskId(null)} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full">
                        <ArrowLeft size={20} />
                    </button>
                    <span className="ml-2 font-bold text-slate-800 dark:text-white truncate flex-1">任务详情</span>
                </div>
                <div className="flex-1 overflow-y-auto touch-auto pb-[env(safe-area-inset-bottom)]">
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
    </>
  );
};

export default MatterBoard;