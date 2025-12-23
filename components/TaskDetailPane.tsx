import React, { useEffect, useState, useRef } from 'react';
import { Task, TaskStatus, Material, StatusUpdate } from '../types';
import { FileText, CheckCircle2, Circle, Trash2, Plus, X, Check, MessageSquare, Edit3, Upload, File as FileIcon, Calendar, Package } from 'lucide-react';
import { saveFile, getFile, deleteFile as deleteFileFromDB } from '../services/storage';

interface Props {
  task: Task;
  matterDueDate?: number;
  onUpdate: (updatedTask: Task) => void;
  onDelete: () => void;
  isTemplateMode?: boolean;
}

const TaskDetailPane: React.FC<Props> = ({ task, matterDueDate, onUpdate, onDelete, isTemplateMode = false }) => {
  const [localTitle, setLocalTitle] = useState(task.title);
  
  // Add Material State
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [addingCategory, setAddingCategory] = useState<'REFERENCE' | 'DELIVERABLE'>('DELIVERABLE');
  const [newMaterialName, setNewMaterialName] = useState('');
  const materialInputRef = useRef<HTMLInputElement>(null);

  // Status Update State
  const [newUpdateContent, setNewUpdateContent] = useState('');
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // Custom Status Edit State
  const [isEditingCustomStatus, setIsEditingCustomStatus] = useState(false);
  const [customStatusText, setCustomStatusText] = useState(task.customStatus || '自定义状态');

  // Drag and Drop State
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  // Sync local state when task changes (switching tasks)
  useEffect(() => {
    setLocalTitle(task.title);
    setIsAddingMaterial(false);
    setNewMaterialName('');
    setNewUpdateContent('');
    setIsEditingCustomStatus(false);
    setCustomStatusText(task.customStatus || '自定义状态');
    setDragActiveId(null);
  }, [task.id]);

  useEffect(() => {
    if (isAddingMaterial && materialInputRef.current) {
      materialInputRef.current.focus();
    }
  }, [isAddingMaterial]);

  const handleTitleBlur = () => {
    if (localTitle !== task.title) {
      onUpdate({ ...task, title: localTitle, lastUpdated: Date.now() });
    }
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    const updates: Partial<Task> = { status: newStatus, lastUpdated: Date.now() };
    
    // Auto focus logic for Blocked/Exception/Skipped
    if (newStatus === TaskStatus.BLOCKED || newStatus === TaskStatus.EXCEPTION || newStatus === TaskStatus.SKIPPED) {
       setTimeout(() => {
           noteInputRef.current?.focus();
       }, 100);
    }

    if (newStatus === TaskStatus.OTHER && !task.customStatus) {
       updates.customStatus = "自定义状态";
       setIsEditingCustomStatus(true);
       setCustomStatusText(''); // Clear text so user can type immediately
    }

    onUpdate({ ...task, ...updates });
  };

  const startEditingCustom = () => {
      setIsEditingCustomStatus(true);
      // Clear text if it matches placeholder to allow fresh input
      if (customStatusText === '自定义状态') {
          setCustomStatusText('');
      }
  };

  const saveCustomStatus = () => {
     const finalStatus = customStatusText.trim() || '自定义状态';
     onUpdate({ ...task, customStatus: finalStatus, lastUpdated: Date.now() });
     setIsEditingCustomStatus(false);
     setCustomStatusText(finalStatus);
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ ...task, description: e.target.value, lastUpdated: Date.now() });
  };

  // --- Date Handling ---
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (!val) {
          onUpdate({ ...task, dueDate: undefined, lastUpdated: Date.now() });
          return;
      }
      
      const ts = new Date(val).getTime();

      // Validation
      if (matterDueDate && ts > matterDueDate) {
          if(!confirm("该任务的截止时间晚于整个事项的截止时间，确定要设置吗？")) {
              return;
          }
      }

      onUpdate({ ...task, dueDate: ts, lastUpdated: Date.now() });
  };


  const toggleMaterial = (matId: string) => {
    const newMaterials = task.materials.map(m => 
      m.id === matId ? { ...m, isReady: !m.isReady } : m
    );
    onUpdate({ ...task, materials: newMaterials, lastUpdated: Date.now() });
  };

  const confirmAddMaterial = () => {
    if (newMaterialName.trim()) {
      const newMat: Material = { 
        id: Math.random().toString(36).substr(2, 9), 
        name: newMaterialName.trim(), 
        category: addingCategory,
        isReady: false 
      };
      onUpdate({ ...task, materials: [...task.materials, newMat], lastUpdated: Date.now() });
    }
    setNewMaterialName('');
    setIsAddingMaterial(false);
  };

  const deleteMaterial = async (mat: Material) => {
    onUpdate({ ...task, materials: task.materials.filter(m => m.id !== mat.id), lastUpdated: Date.now() });
  };

  // --- File Handling ---

  const processFile = async (matId: string, file: File) => {
      const fileId = Math.random().toString(36).substr(2, 9);
      await saveFile(fileId, file);

      const newMaterials = task.materials.map(m => 
          m.id === matId ? { 
              ...m, 
              fileId: fileId, 
              fileName: file.name, 
              fileType: file.type, 
              fileSize: file.size,
              isReady: true // Auto mark as ready when uploaded
          } : m
      );
      onUpdate({ ...task, materials: newMaterials, lastUpdated: Date.now() });
  };

  const handleFileUpload = async (matId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await processFile(matId, file);
  };

  const handleFileDownload = async (mat: Material) => {
      if (!mat.fileId) return;
      const file = await getFile(mat.fileId);
      if (file) {
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url;
          a.download = mat.fileName || 'download';
          a.click();
          URL.revokeObjectURL(url);
      } else {
          alert("文件丢失或无法读取");
      }
  };

  const deleteFileAttachment = async (matId: string, fileId?: string) => {
      const newMaterials = task.materials.map(m => 
          m.id === matId ? { ...m, fileId: undefined, fileName: undefined, fileType: undefined, fileSize: undefined } : m
      );
      onUpdate({ ...task, materials: newMaterials, lastUpdated: Date.now() });
  };

  // --- Drag and Drop Handlers ---

  const handleDragEnter = (e: React.DragEvent, matId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveId(matId);
  };

  const handleDragLeave = (e: React.DragEvent, matId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragActiveId === matId) {
        setDragActiveId(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent, matId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActiveId(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        await processFile(matId, e.dataTransfer.files[0]);
    }
  };

  // --- Status Updates ---

  const addStatusUpdate = () => {
    if (!newUpdateContent.trim()) return;

    const newUpdate: StatusUpdate = {
        id: Math.random().toString(36).substr(2, 9),
        content: newUpdateContent.trim(),
        timestamp: Date.now()
    };

    const currentUpdates = task.statusUpdates || [];
    onUpdate({
        ...task,
        statusUpdates: [newUpdate, ...currentUpdates], // Add to top
        lastUpdated: Date.now()
    });
    setNewUpdateContent('');
  };

  const deleteStatusUpdate = (updateId: string) => {
      if(!confirm("确定删除这条记录吗？")) return;
      const currentUpdates = task.statusUpdates || [];
      onUpdate({
          ...task,
          statusUpdates: currentUpdates.filter(u => u.id !== updateId),
          lastUpdated: Date.now()
      });
  };

  // Format timestamp helper
  const formatTime = (ts: number) => {
      return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // Helper to determine input theme
  const getInputTheme = () => {
      switch(task.status) {
          case TaskStatus.BLOCKED: return 'bg-amber-50 border-amber-200 focus-within:ring-amber-200 focus-within:border-amber-400 dark:bg-amber-900/10 dark:border-amber-800';
          case TaskStatus.EXCEPTION: return 'bg-purple-50 border-purple-200 focus-within:ring-purple-200 focus-within:border-purple-400 dark:bg-purple-900/10 dark:border-purple-800';
          case TaskStatus.SKIPPED: return 'bg-gray-50 border-gray-200 focus-within:ring-gray-200 focus-within:border-gray-400 dark:bg-gray-800/30 dark:border-gray-700';
          default: return 'bg-slate-50 border-slate-200 focus-within:ring-blue-100 focus-within:border-blue-300 dark:bg-slate-800 dark:border-slate-700';
      }
  };

  const getPlaceholder = () => {
      switch(task.status) {
          case TaskStatus.BLOCKED: return "卡在哪里了？在等谁？预计什么时候恢复？";
          case TaskStatus.EXCEPTION: return "为什么要例外处理？依据是什么？";
          case TaskStatus.SKIPPED: return "为什么这步不需要做？";
          default: return "添加新的进展记录...";
      }
  };

  // --- Split Materials ---
  // Default legacy materials to DELIVERABLE unless they have a file and we are in template mode (which assumes we are building refs)
  // Actually, safe default is DELIVERABLE.
  const referenceMaterials = task.materials.filter(m => m.category === 'REFERENCE');
  const deliverableMaterials = task.materials.filter(m => m.category !== 'REFERENCE');

  const renderMaterialList = (list: Material[], type: 'REFERENCE' | 'DELIVERABLE') => {
      const isRef = type === 'REFERENCE';
      
      // If reference list is empty and user not adding, HIDE IT completely to save space
      if (isRef && list.length === 0 && !isAddingMaterial) {
          return null;
      }

      if (!isRef && list.length === 0 && !isAddingMaterial) {
          return <div className="text-sm text-slate-300 italic py-1">暂无交付产物</div>;
      }

      return (
          <div className="space-y-2 mt-2">
            {list.map(m => (
               <div 
                  key={m.id}
                  // Only allow drag-drop upload if:
                  // 1. It's DELIVERABLE
                  // 2. OR It's REFERENCE and we are in Template Mode (to upload the template file)
                  onDragEnter={(e) => {
                      if (!isRef || isTemplateMode) handleDragEnter(e, m.id)
                  }}
                  onDragLeave={(e) => {
                      if (!isRef || isTemplateMode) handleDragLeave(e, m.id)
                  }}
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                      if (!isRef || isTemplateMode) handleDrop(e, m.id)
                  }}
                  className={`group flex items-center gap-3 p-3 rounded-lg border transition-all relative ${
                      dragActiveId === m.id 
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 border-dashed z-10' 
                      : 'border-slate-100 dark:border-slate-700 hover:border-blue-100 dark:hover:border-blue-800 hover:bg-blue-50/30 dark:hover:bg-blue-900/10'
                  }`}
               >
                  {dragActiveId === m.id && (
                     <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-800/80 rounded-lg pointer-events-none">
                         <span className="text-sm font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2"><Upload size={16}/> 松开以上传</span>
                     </div>
                  )}

                  <button 
                    onClick={() => toggleMaterial(m.id)}
                    // References in non-template mode are typically read-only regarding 'readiness', but users might want to tick them off as "Read".
                    className={`transition-colors shrink-0 ${m.isReady ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'}`}
                  >
                    {m.isReady ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                      <div className={`text-sm ${m.isReady ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-300'}`}>
                        {m.name}
                      </div>
                      
                      <div className="mt-1 flex items-center gap-2 h-5">
                          {m.fileName ? (
                              <>
                                <button 
                                  onClick={() => handleFileDownload(m)}
                                  className="text-[10px] flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline max-w-[150px] truncate"
                                  title="点击下载"
                                >
                                    <FileIcon size={10} /> {m.fileName}
                                </button>
                                {/* Allow delete if: Deliverable OR (Reference AND TemplateMode) */}
                                {(!isRef || isTemplateMode) && (
                                    <button 
                                    onClick={() => deleteFileAttachment(m.id, m.fileId)}
                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="删除文件"
                                    >
                                    <X size={10} />
                                    </button>
                                )}
                              </>
                          ) : (
                              // Allow upload if: Deliverable OR (Reference AND TemplateMode)
                              (!isRef || isTemplateMode) ? (
                                <label className="cursor-pointer text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors">
                                    <Upload size={10} /> 上传文件 (或拖拽至此)
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        onChange={(e) => handleFileUpload(m.id, e)}
                                    />
                                </label>
                              ) : (
                                <span className="text-[10px] text-slate-300 italic">暂无文件</span>
                              )
                          )}
                      </div>
                  </div>

                  {(!isRef || isTemplateMode) && (
                      <button onClick={() => deleteMaterial(m)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 shrink-0">
                        <Trash2 size={16} />
                      </button>
                  )}
               </div>
             ))}
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900 animate-fadeIn">
      {/* Header Area */}
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start shrink-0">
        <div className="flex-1 mr-4 min-w-0">
          <input 
            className="w-full text-xl font-bold text-slate-800 dark:text-slate-100 border-none outline-none focus:ring-0 placeholder-slate-300 bg-transparent truncate"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="任务标题..."
          />
        </div>
        
        {/* Actions Right Side */}
        <div className="flex items-center gap-1 shrink-0">
            {/* Due Date Picker (Compact) */}
            <div className="relative flex items-center justify-center p-2 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group">
                 <div className="flex items-center gap-1.5 cursor-pointer">
                    <Calendar size={18} className={`${task.dueDate ? 'text-blue-500' : 'text-slate-300 hover:text-slate-500'}`} />
                    {task.dueDate && (
                        <span className="text-xs font-mono text-slate-600 dark:text-slate-400 hidden sm:inline">
                             {new Date(task.dueDate).toLocaleDateString(undefined, {month:'numeric', day:'numeric'})}
                        </span>
                    )}
                 </div>
                 <input 
                    type="date"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                    onChange={handleDateChange}
                    title={task.dueDate ? `截止: ${new Date(task.dueDate).toLocaleDateString()}` : "设置截止日期"}
                />
            </div>

            <button 
                onClick={() => { if(confirm('确定删除此任务吗？')) onDelete(); }}
                className="text-slate-300 hover:text-red-500 transition-colors p-2"
                title="删除任务"
            >
                <Trash2 size={18} />
            </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* 0. Status Buttons (Moved to Body) */}
        <div className="mb-6">
            <div className="flex gap-1.5 flex-wrap items-center">
                {[
                TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, 
                TaskStatus.BLOCKED, TaskStatus.SKIPPED, TaskStatus.EXCEPTION, TaskStatus.OTHER
                ].map((s) => (
                <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all whitespace-nowrap ${
                    task.status === s
                        ? 'ring-1 ring-offset-1 ring-slate-400 dark:ring-slate-600 font-bold shadow-sm'
                        : 'opacity-70 hover:opacity-100 bg-white dark:bg-slate-800'
                    } ${
                        s === TaskStatus.PENDING ? 'text-slate-600 border-slate-200 dark:text-slate-300 dark:border-slate-700' :
                        s === TaskStatus.IN_PROGRESS ? 'text-blue-700 border-blue-200 dark:text-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30' :
                        s === TaskStatus.COMPLETED ? 'text-emerald-700 border-emerald-200 dark:text-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30' :
                        s === TaskStatus.BLOCKED ? 'text-amber-700 border-amber-200 dark:text-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30' :
                        s === TaskStatus.SKIPPED ? 'text-gray-400 border-gray-200 dark:text-gray-500 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50' : 
                        s === TaskStatus.EXCEPTION ? 'text-purple-700 border-purple-200 dark:text-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30' :
                        'text-indigo-700 border-indigo-200 dark:text-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/30'
                    }`}
                >
                    {s === TaskStatus.PENDING ? '待办' :
                    s === TaskStatus.IN_PROGRESS ? '进行中' :
                    s === TaskStatus.COMPLETED ? '完成' :
                    s === TaskStatus.BLOCKED ? '受阻' :
                    s === TaskStatus.SKIPPED ? '不适用' : 
                    s === TaskStatus.EXCEPTION ? '例外' :
                    (task.customStatus || '其他')}
                </button>
                ))}
                
                {/* Custom Status Editor */}
                {task.status === TaskStatus.OTHER && (
                    <div className="relative">
                    {isEditingCustomStatus ? (
                        <input 
                            autoFocus
                            value={customStatusText}
                            onChange={(e) => setCustomStatusText(e.target.value)}
                            onBlur={saveCustomStatus}
                            onKeyDown={(e) => e.key === 'Enter' && saveCustomStatus()}
                            className="text-xs px-2 py-0.5 rounded border border-indigo-300 outline-none w-24 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                            placeholder="输入状态"
                        />
                    ) : (
                        <button onClick={startEditingCustom} className="p-1 text-slate-300 hover:text-indigo-600">
                            <Edit3 size={14} />
                        </button>
                    )}
                    </div>
                )}
            </div>
        </div>
        
        {/* 1. Combined Status Notes & Description */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 mb-8">
            
            {/* Current Situation (Primary) */}
            <div className="flex-1 min-w-0">
                <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <MessageSquare size={14} /> 当前情况 / 备注
                </label>
                
                {/* New Input */}
                <div className={`mb-6 p-3 rounded-lg border transition-all ${getInputTheme()}`}>
                    <textarea
                        ref={noteInputRef}
                        value={newUpdateContent}
                        onChange={(e) => setNewUpdateContent(e.target.value)}
                        placeholder={getPlaceholder()}
                        className="w-full bg-transparent border-none outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400/70 resize-none mb-2"
                        rows={2}
                        onKeyDown={(e) => { if(e.ctrlKey && e.key === 'Enter') addStatusUpdate(); }}
                    />
                    <div className="flex justify-end">
                        <button 
                            onClick={addStatusUpdate}
                            disabled={!newUpdateContent.trim()}
                            className="bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded text-xs font-medium hover:bg-white hover:text-blue-600 disabled:opacity-50 transition-colors shadow-sm"
                        >
                            添加记录
                        </button>
                    </div>
                </div>

                {/* Timeline List */}
                <div className="space-y-4 pl-2 relative">
                    <div className="absolute left-[5px] top-2 bottom-2 w-[1px] bg-slate-200 dark:bg-slate-800"></div>
                    
                    {(task.statusUpdates || []).map((update) => (
                        <div key={update.id} className="relative pl-6 group">
                            <div className="absolute left-[2px] top-1.5 w-[7px] h-[7px] rounded-full bg-slate-300 dark:bg-slate-600 border-2 border-white dark:border-slate-900 ring-1 ring-slate-100 dark:ring-slate-800"></div>
                            <div className="flex items-baseline justify-between mb-1">
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-50 dark:bg-slate-800 px-1 rounded">{formatTime(update.timestamp)}</span>
                                <button 
                                    onClick={() => deleteStatusUpdate(update.id)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity p-1 cursor-pointer"
                                    title="删除记录"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                            <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {update.content}
                            </div>
                        </div>
                    ))}

                    {/* Legacy Note Support */}
                    {task.statusNote && (!task.statusUpdates || task.statusUpdates.length === 0) && (
                        <div className="relative pl-6">
                            <div className="absolute left-[2px] top-1.5 w-[7px] h-[7px] rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-100"></div>
                            <div className="mb-1"><span className="text-[10px] text-slate-400 italic">历史备注</span></div>
                            <div className="text-sm text-slate-600 whitespace-pre-wrap">{task.statusNote}</div>
                        </div>
                    )}
                    
                    {(!task.statusUpdates?.length && !task.statusNote) && (
                        <div className="text-xs text-slate-400 pl-6 italic pt-2">暂无记录</div>
                    )}
                </div>
            </div>

            {/* Description (Sidebar) */}
            <div className="w-full lg:w-72 xl:w-80 shrink-0">
                 <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-100 dark:border-slate-800 h-fit sticky top-0">
                    <label className="block text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                        任务指引 (标准说明)
                    </label>
                    <textarea
                        value={task.description || ''}
                        onChange={handleDescriptionChange}
                        placeholder="输入此任务的标准操作指引（选填）..."
                        className="w-full bg-transparent border-b border-transparent focus:border-blue-300 dark:focus:border-blue-700 outline-none text-sm text-slate-600 dark:text-slate-300 resize-none leading-relaxed"
                        rows={6} 
                    />
                 </div>
            </div>
        </div>

        {/* 3. Materials Sections */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
           
           {/* Section 1: Reference Materials (Conditional Rendering) */}
           {(referenceMaterials.length > 0 || isAddingMaterial) ? (
               <div className="mb-6">
                   <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                            <FileText size={14} /> 参考资料 / 模板
                        </label>
                        {isTemplateMode && !isAddingMaterial && (
                            <button 
                                onClick={() => { setIsAddingMaterial(true); setAddingCategory('REFERENCE'); }} 
                                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 py-1 px-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                            >
                                <Plus size={12} /> 添加参考文件
                            </button>
                        )}
                   </div>
                   {renderMaterialList(referenceMaterials, 'REFERENCE')}
               </div>
           ) : (
                /* Hidden or minimized when empty, unless user is admin/template mode might want to add */
                isTemplateMode && (
                    <div className="mb-6 flex justify-between items-center">
                         <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <FileText size={14} /> 参考资料 / 模板
                        </label>
                        <button 
                            onClick={() => { setIsAddingMaterial(true); setAddingCategory('REFERENCE'); }} 
                            className="text-xs text-slate-400 hover:text-blue-600 flex items-center gap-1"
                        >
                            <Plus size={12} /> 添加
                        </button>
                    </div>
                )
           )}

           {/* Section 2: Deliverables */}
           <div>
               <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-wider flex items-center gap-2">
                        <Package size={14} /> 所需产物 / 交付物
                    </label>
                    {!isAddingMaterial && (
                        <button 
                            onClick={() => { setIsAddingMaterial(true); setAddingCategory('DELIVERABLE'); }} 
                            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 py-1 px-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                        >
                            <Plus size={12} /> 添加产物项
                        </button>
                    )}
               </div>
               {renderMaterialList(deliverableMaterials, 'DELIVERABLE')}
           </div>

           {/* Add Material Input */}
            {isAddingMaterial && (
            <div className="mt-4 flex items-center gap-2 p-2 border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-slate-800 shadow-sm animate-fadeIn">
                <Circle size={20} className="text-slate-300" />
                <div className="flex-1">
                    <div className="text-[10px] text-blue-500 font-bold uppercase mb-0.5">
                        {addingCategory === 'REFERENCE' ? '新增参考资料' : '新增交付产物'}
                    </div>
                    <input
                        ref={materialInputRef}
                        value={newMaterialName}
                        onChange={(e) => setNewMaterialName(e.target.value)}
                        placeholder="输入名称 (Enter确认)"
                        className="w-full text-sm outline-none text-slate-700 dark:text-slate-200 bg-transparent"
                        onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmAddMaterial();
                        if (e.key === 'Escape') setIsAddingMaterial(false);
                        }}
                    />
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={confirmAddMaterial} className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"><Check size={16}/></button>
                    <button onClick={() => setIsAddingMaterial(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"><X size={16}/></button>
                </div>
            </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default TaskDetailPane;