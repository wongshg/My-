import React, { useEffect, useState, useRef } from 'react';
import { Task, TaskStatus, Material, StatusUpdate } from '../types';
import { FileText, CheckCircle2, Circle, Trash2, Plus, X, Check, MessageSquare, Edit3, Upload, File as FileIcon, Calendar } from 'lucide-react';
import { saveFile, getFile, deleteFile as deleteFileFromDB } from '../services/storage';

interface Props {
  task: Task;
  matterDueDate?: number; // Optional validation
  onUpdate: (updatedTask: Task) => void;
  onDelete: () => void;
}

const TaskDetailPane: React.FC<Props> = ({ task, matterDueDate, onUpdate, onDelete }) => {
  const [localTitle, setLocalTitle] = useState(task.title);
  
  // Add Material State
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
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
    }

    onUpdate({ ...task, ...updates });
  };

  const saveCustomStatus = () => {
     onUpdate({ ...task, customStatus: customStatusText, lastUpdated: Date.now() });
     setIsEditingCustomStatus(false);
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
        isReady: false 
      };
      onUpdate({ ...task, materials: [...task.materials, newMat], lastUpdated: Date.now() });
    }
    setNewMaterialName('');
    setIsAddingMaterial(false);
  };

  const deleteMaterial = async (mat: Material) => {
    if (mat.fileId) {
       await deleteFileFromDB(mat.fileId);
    }
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
      if (fileId) {
          await deleteFileFromDB(fileId);
      }
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
          case TaskStatus.BLOCKED: return 'bg-amber-50 border-amber-200 focus-within:ring-amber-200 focus-within:border-amber-400';
          case TaskStatus.EXCEPTION: return 'bg-purple-50 border-purple-200 focus-within:ring-purple-200 focus-within:border-purple-400';
          case TaskStatus.SKIPPED: return 'bg-gray-50 border-gray-200 focus-within:ring-gray-200 focus-within:border-gray-400';
          default: return 'bg-slate-50 border-slate-200 focus-within:ring-blue-100 focus-within:border-blue-300';
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

  return (
    <div className="h-full flex flex-col bg-white animate-fadeIn">
      {/* Header Area */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-start shrink-0">
        <div className="flex-1 mr-4">
          <input 
            className="w-full text-xl font-bold text-slate-800 border-none outline-none focus:ring-0 placeholder-slate-300 bg-transparent"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder="任务标题..."
          />
          <div className="flex gap-2 mt-3 flex-wrap items-center">
             {[
               TaskStatus.PENDING, TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, 
               TaskStatus.BLOCKED, TaskStatus.SKIPPED, TaskStatus.EXCEPTION, TaskStatus.OTHER
             ].map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                  task.status === s
                    ? 'ring-2 ring-offset-1 ring-slate-400 font-semibold shadow-sm'
                    : 'opacity-60 hover:opacity-100'
                } ${
                    s === TaskStatus.PENDING ? 'bg-slate-100 text-slate-600 border-slate-200' :
                    s === TaskStatus.IN_PROGRESS ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    s === TaskStatus.COMPLETED ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    s === TaskStatus.BLOCKED ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    s === TaskStatus.SKIPPED ? 'bg-gray-50 text-gray-400 border-gray-200' : 
                    s === TaskStatus.EXCEPTION ? 'bg-purple-50 text-purple-700 border-purple-200' :
                    'bg-indigo-50 text-indigo-700 border-indigo-200'
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
                         className="text-xs px-2 py-1 rounded border border-indigo-300 outline-none w-24"
                       />
                   ) : (
                       <button onClick={() => setIsEditingCustomStatus(true)} className="p-1 text-slate-300 hover:text-indigo-600">
                           <Edit3 size={12} />
                       </button>
                   )}
                </div>
            )}
          </div>
        </div>
        <button 
          onClick={() => { if(confirm('确定删除此任务吗？')) onDelete(); }}
          className="text-slate-300 hover:text-red-500 transition-colors p-2"
          title="删除任务"
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        
        {/* Due Date & Description */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                    <Calendar size={14} /> 截止时间
                </span>
                <input 
                    type="date"
                    className="bg-transparent text-sm text-slate-700 focus:text-blue-600 outline-none cursor-pointer text-right"
                    value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                    onChange={handleDateChange}
                />
            </div>
        </div>

        <div>
           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              任务指引 (标准说明)
           </label>
           <textarea
             value={task.description || ''}
             onChange={handleDescriptionChange}
             placeholder="输入此任务的标准操作指引（选填）..."
             className="w-full bg-white border-b border-slate-200 focus:border-blue-500 outline-none text-sm text-slate-600 py-2 resize-none"
             rows={2}
           />
        </div>

        {/* Status Notes Timeline */}
        <div>
           <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare size={14} /> 当前情况 / 判断依据 / 备注
           </label>
           
           {/* New Input - Dynamic Styling */}
           <div className={`mb-6 p-3 rounded-lg border transition-all ${getInputTheme()}`}>
              <textarea
                ref={noteInputRef}
                value={newUpdateContent}
                onChange={(e) => setNewUpdateContent(e.target.value)}
                placeholder={getPlaceholder()}
                className="w-full bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400/70 resize-none mb-2"
                rows={3}
                onKeyDown={(e) => { if(e.ctrlKey && e.key === 'Enter') addStatusUpdate(); }}
              />
              <div className="flex justify-end">
                  <button 
                    onClick={addStatusUpdate}
                    disabled={!newUpdateContent.trim()}
                    className="bg-white/80 border border-slate-200 text-slate-600 px-3 py-1.5 rounded text-xs font-medium hover:bg-white hover:text-blue-600 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    添加记录
                  </button>
              </div>
           </div>

           {/* Timeline List */}
           <div className="space-y-4 pl-2 relative">
              <div className="absolute left-[5px] top-2 bottom-2 w-[1px] bg-slate-200"></div>
              
              {(task.statusUpdates || []).map((update) => (
                  <div key={update.id} className="relative pl-6 group">
                      <div className="absolute left-[2px] top-1.5 w-[7px] h-[7px] rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-100"></div>
                      <div className="flex items-baseline justify-between mb-1">
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1 rounded">{formatTime(update.timestamp)}</span>
                          <button 
                             onClick={() => deleteStatusUpdate(update.id)}
                             className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity p-1 cursor-pointer"
                             title="删除记录"
                          >
                             <X size={12} />
                          </button>
                      </div>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
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

        {/* Materials */}
        <div className="pt-4 border-t border-slate-100">
           <div className="flex items-center justify-between mb-3">
             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <FileText size={14} /> 所需材料 / 产物
             </label>
             {!isAddingMaterial && (
               <button 
                 onClick={() => setIsAddingMaterial(true)} 
                 className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 py-1 px-2 hover:bg-blue-50 rounded"
               >
                 <Plus size={12} /> 添加材料
               </button>
             )}
           </div>
           
           <div className="space-y-2">
             {task.materials.length === 0 && !isAddingMaterial && (
               <div className="text-sm text-slate-300 italic">无需特定材料</div>
             )}
             
             {task.materials.map(m => (
               <div 
                  key={m.id}
                  // Drag and Drop Logic
                  onDragEnter={(e) => handleDragEnter(e, m.id)}
                  onDragLeave={(e) => handleDragLeave(e, m.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, m.id)}
                  className={`group flex items-center gap-3 p-3 rounded-lg border transition-all relative ${
                      dragActiveId === m.id 
                      ? 'border-blue-500 bg-blue-50 border-dashed z-10' 
                      : 'border-slate-100 hover:border-blue-100 hover:bg-blue-50/30'
                  }`}
               >
                  {dragActiveId === m.id && (
                     <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg pointer-events-none">
                         <span className="text-sm font-bold text-blue-600 flex items-center gap-2"><Upload size={16}/> 松开以上传</span>
                     </div>
                  )}

                  <button 
                    onClick={() => toggleMaterial(m.id)}
                    className={`transition-colors shrink-0 ${m.isReady ? 'text-emerald-500' : 'text-slate-300 hover:text-slate-400'}`}
                  >
                    {m.isReady ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                      <div className={`text-sm ${m.isReady ? 'text-slate-400' : 'text-slate-700'}`}>
                        {m.name}
                      </div>
                      {/* File Info / Action Area */}
                      <div className="mt-1 flex items-center gap-2 h-5">
                          {m.fileName ? (
                              <>
                                <button 
                                  onClick={() => handleFileDownload(m)}
                                  className="text-[10px] flex items-center gap-1 text-blue-600 hover:underline max-w-[150px] truncate"
                                  title="点击下载"
                                >
                                    <FileIcon size={10} /> {m.fileName}
                                </button>
                                <button 
                                   onClick={() => deleteFileAttachment(m.id, m.fileId)}
                                   className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                   title="删除文件"
                                >
                                   <X size={10} />
                                </button>
                              </>
                          ) : (
                              <label className="cursor-pointer text-[10px] text-slate-400 hover:text-blue-600 flex items-center gap-1 transition-colors">
                                  <Upload size={10} /> 上传文件 (或拖拽至此)
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    onChange={(e) => handleFileUpload(m.id, e)}
                                  />
                              </label>
                          )}
                      </div>
                  </div>

                  <button onClick={() => deleteMaterial(m)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 shrink-0">
                    <Trash2 size={16} />
                  </button>
               </div>
             ))}

             {/* Add Material Input */}
             {isAddingMaterial && (
                <div className="flex items-center gap-2 p-2 border border-blue-300 rounded-lg bg-white shadow-sm animate-fadeIn">
                   <Circle size={20} className="text-slate-300" />
                   <input
                      ref={materialInputRef}
                      value={newMaterialName}
                      onChange={(e) => setNewMaterialName(e.target.value)}
                      placeholder="材料名称 (Enter确认)"
                      className="flex-1 text-sm outline-none text-slate-700"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmAddMaterial();
                        if (e.key === 'Escape') setIsAddingMaterial(false);
                      }}
                   />
                   <div className="flex items-center gap-1">
                      <button onClick={confirmAddMaterial} className="p-1 text-blue-600 hover:bg-blue-50 rounded"><Check size={16}/></button>
                      <button onClick={() => setIsAddingMaterial(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded"><X size={16}/></button>
                   </div>
                </div>
             )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default TaskDetailPane;