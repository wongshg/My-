import React, { useState, useEffect, useRef } from 'react';
import { Matter, Template, TaskStatus, Task, Stage } from './types';
import { ALL_TEMPLATES } from './constants';
import MatterBoard from './components/MatterBoard';
import Dashboard from './components/Dashboard';
import { Plus, Trash2, LayoutTemplate, X, Check, Edit2, Save, Database, Upload, Download } from 'lucide-react';
import JSZip from 'jszip';
import { getFile, saveFile } from './services/storage';

// --- Local Storage Helpers ---
const STORAGE_KEY = 'opus_matters_v1';
const TEMPLATE_KEY = 'opus_templates_v1';
const THEME_KEY = 'opus_theme_v1';

const saveMatters = (matters: Matter[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(matters));
};
const loadMatters = (): Matter[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

const saveTemplates = (templates: Template[]) => {
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates));
};

const loadTemplates = (): Template[] => {
  const data = localStorage.getItem(TEMPLATE_KEY);
  if (!data) {
      saveTemplates(ALL_TEMPLATES);
      return ALL_TEMPLATES;
  }
  return JSON.parse(data);
};

const uuid = () => Math.random().toString(36).substr(2, 9);

// --- Notification Logic ---
const checkDueTasks = (matters: Matter[]) => {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    let dueCount = 0;

    matters.forEach(m => {
        // Check Matter Due Date
        if (m.dueDate) {
             const d = new Date(m.dueDate);
             d.setHours(0,0,0,0);
             if (d.getTime() === today.getTime() || d.getTime() === tomorrow.getTime()) {
                 dueCount++;
             }
        }
        // Check Tasks
        m.stages.forEach(s => {
            s.tasks.forEach(t => {
                if (t.dueDate && t.status !== TaskStatus.COMPLETED) {
                    const d = new Date(t.dueDate);
                    d.setHours(0,0,0,0);
                     if (d.getTime() === today.getTime() || d.getTime() === tomorrow.getTime()) {
                         dueCount++;
                     }
                }
            })
        })
    });

    if (dueCount > 0) {
        new Notification("Orbit 工作台提醒", {
            body: `您有 ${dueCount} 个事项或任务即将在今天或明天到期，请及时处理。`,
            icon: '/favicon.ico' 
        });
    }
};

// --- Standalone Components ---

const TemplateManagerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    templates: Template[];
    onCreate: () => void;
    onEdit: (t: Template) => void;
    onDelete: (id: string) => void;
}> = ({ isOpen, onClose, templates, onCreate, onEdit, onDelete }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] animate-scaleIn" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <LayoutTemplate size={20} /> 模板管理
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                        <X size={24} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">已录入模板 (全部)</h3>
                            <button onClick={onCreate} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                                <Plus size={12} /> 新建空白模板
                            </button>
                        </div>

                        {templates.length === 0 && (
                            <div className="text-sm text-slate-400 italic bg-slate-50 dark:bg-slate-800 p-4 rounded-lg">
                                暂无模板。
                            </div>
                        )}

                        {templates.map(t => (
                            <div key={t.id} className="flex justify-between items-start p-3 border rounded-lg bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 group transition-all">
                                <div className="flex-1">
                                    <div className="font-semibold text-slate-800 dark:text-slate-200">{t.name}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.description}</div>
                                </div>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => onEdit(t)}
                                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-1 text-xs"
                                        title="编辑详细内容"
                                    >
                                        <Edit2 size={14} /> 编辑
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation(); // Double safety
                                            onDelete(t.id);
                                        }}
                                        className="p-1.5 text-slate-400 hover:text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                        title="删除"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};


const App: React.FC = () => {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeMatterId, setActiveMatterId] = useState<string | null>(null);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem(THEME_KEY) as 'light' | 'dark' | 'system') || 'system';
  });

  // Notif State
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'default'
  );

  // Template Editing State
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Modals
  const [isNewMatterModalOpen, setIsNewMatterModalOpen] = useState(false);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  
  // Save Template Modal State
  const [isSaveTemplateModalOpen, setIsSaveTemplateModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [matterToTemplate, setMatterToTemplate] = useState<Matter | null>(null);

  // Settings / Backup Modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProcessingBackup, setIsProcessingBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply Theme & Update Meta Tag for Mobile Status Bar
  useEffect(() => {
     const root = window.document.documentElement;
     const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
     const isDark = theme === 'dark' || (theme === 'system' && isSystemDark);
     
     if (isDark) {
         root.classList.add('dark');
     } else {
         root.classList.remove('dark');
     }
     localStorage.setItem(THEME_KEY, theme);

     // Update <meta name="theme-color"> for iOS Safari & Android Chrome
     // Light: #f8fafc (slate-50) | Dark: #020617 (slate-950)
     const metaThemeColor = document.querySelector('meta[name="theme-color"]');
     if (metaThemeColor) {
         // Using the exact background color helps Safari blend the status bar
         metaThemeColor.setAttribute('content', isDark ? '#020617' : '#f8fafc');
     }

     // Also update status bar style for iOS PWA mode
     const metaStatusBarStyle = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
     if (metaStatusBarStyle) {
         // black-translucent allows content to go under, but 'default' (white) or 'black' (black) helps with text color contrast in some scenarios.
         // However, with viewport-fit=cover, 'black-translucent' is usually best, relying on body bg color.
         // If text color isn't switching, sometimes toggling this helps, but usually theme-color is key.
         metaStatusBarStyle.setAttribute('content', 'black-translucent');
     }

  }, [theme]);

  useEffect(() => {
    const loadedMatters = loadMatters();
    setMatters(loadedMatters);
    setTemplates(loadTemplates());
    
    // Check notifications once on load
    checkDueTasks(loadedMatters);
  }, []);

  const requestNotificationPermission = async () => {
     if (!('Notification' in window)) return;
     const result = await Notification.requestPermission();
     setNotifPermission(result);
     if (result === 'granted') {
         checkDueTasks(matters);
         alert("提醒已开启！应用将在任务到期前通知您。");
     }
  };

  const handleCreateMatter = (template: Template, title: string, dueDate: string) => {
    const newMatter: Matter = {
      id: uuid(),
      title: title || `${template.name} - ${new Date().toLocaleDateString()}`,
      type: template.name,
      dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      stages: JSON.parse(JSON.stringify(template.stages)), // Deep copy
      archived: false
    };
    const updated = [newMatter, ...matters];
    setMatters(updated);
    saveMatters(updated);
    setIsNewMatterModalOpen(false);
    setActiveMatterId(newMatter.id);
  };

  const handleUpdateMatter = (updatedMatter: Matter) => {
    const updatedList = matters.map(m => m.id === updatedMatter.id ? updatedMatter : m);
    setMatters(updatedList);
    
    if (!editingTemplateId) {
       saveMatters(updatedList);
    }
  };

  const handleDeleteMatter = (id: string) => {
    if (confirm('确定要删除这个事项吗？操作无法撤销。')) {
      const updated = matters.filter(m => m.id !== id);
      setMatters(updated);
      saveMatters(updated);
      if (activeMatterId === id) setActiveMatterId(null);
    }
  };

  const handleJumpToTask = (matterId: string, taskId: string) => {
      setActiveMatterId(matterId);
      setTargetTaskId(taskId);
  };

  // --- Data Backup & Restore (Full Zip with Files) ---
  const handleExportData = async () => {
      setIsProcessingBackup(true);
      try {
          const zip = new JSZip();
          
          // 1. Export Data JSON
          const data = {
              version: 1,
              date: new Date().toISOString(),
              matters,
              templates
          };
          zip.file("data.json", JSON.stringify(data, null, 2));

          // 2. Export All Referenced Files
          const assetsFolder = zip.folder("assets");
          if (assetsFolder) {
              const fileIds = new Set<string>();
              
              const collectFileIds = (list: any[]) => {
                  list.forEach(m => {
                      m.stages.forEach((s: Stage) => {
                          s.tasks.forEach((t: Task) => {
                              t.materials.forEach(mat => {
                                  if (mat.fileId) fileIds.add(mat.fileId);
                              });
                          });
                      });
                  });
              };

              collectFileIds(matters);
              collectFileIds(templates);

              for (const fid of fileIds) {
                  const fileBlob = await getFile(fid);
                  if (fileBlob) {
                      assetsFolder.file(fid, fileBlob);
                  }
              }
          }

          // 3. Generate Zip
          const content = await zip.generateAsync({ type: "blob" });
          const url = URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = url;
          a.download = `Orbit_FullBackup_${new Date().toISOString().split('T')[0]}.zip`;
          a.click();
          URL.revokeObjectURL(url);
      } catch (e) {
          console.error(e);
          alert("备份失败，请稍后重试");
      } finally {
          setIsProcessingBackup(false);
      }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setIsProcessingBackup(true);
      try {
          const zip = await JSZip.loadAsync(file);
          
          // 1. Read Data JSON
          const jsonFile = zip.file("data.json");
          if (!jsonFile) throw new Error("无效的备份文件：缺少 data.json");
          
          const jsonStr = await jsonFile.async("string");
          const json = JSON.parse(jsonStr);

          // 2. Restore Files
          const assetsFolder = zip.folder("assets");
          let fileCount = 0;
          if (assetsFolder) {
              const filePromises: Promise<void>[] = [];
              assetsFolder.forEach((relativePath, zipEntry) => {
                  filePromises.push(async function() {
                      const blob = await zipEntry.async("blob");
                      // The filename in assets folder is the ID
                      const fileId = zipEntry.name.split('/').pop(); 
                      if (fileId) {
                         // We need to create a File object to store properly with name/type if possible, 
                         // but storage.ts just stores Blob/File.
                         // However, the original File object had name/type properties. 
                         // `blob` from zip might lose original mime type if not stored carefully, 
                         // but we only store the binary. The metadata (name/type) is in the JSON (Material object).
                         // So storing the blob under the ID is sufficient.
                         await saveFile(fileId, blob as File); 
                         fileCount++;
                      }
                  }());
              });
              await Promise.all(filePromises);
          }

          // 3. Restore State
          if (json.matters && Array.isArray(json.matters)) {
              setMatters(json.matters);
              saveMatters(json.matters);
          }
          if (json.templates && Array.isArray(json.templates)) {
              setTemplates(json.templates);
              saveTemplates(json.templates);
          }

          alert(`恢复成功！\n- 事项：${json.matters?.length || 0}\n- 模板：${json.templates?.length || 0}\n- 文件：${fileCount}`);
          setIsSettingsOpen(false);

      } catch (err) {
          alert("文件格式错误或损坏，无法恢复。");
          console.error(err);
      } finally {
          setIsProcessingBackup(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  };


  // --- Template Logic ---

  const initiateSaveTemplate = (matter: Matter) => {
    setMatterToTemplate(matter);
    setTemplateName(`${matter.type} (自定义)`);
    setIsSaveTemplateModalOpen(true);
  };

  const confirmSaveTemplate = () => {
    if (!matterToTemplate || !templateName) return;
    
    // Clean up stages but PRESERVE FILES if they exist
    const cleanStages: Stage[] = matterToTemplate.stages.map(s => ({
      ...s,
      tasks: s.tasks.map(t => ({
        ...t,
        status: TaskStatus.PENDING,
        statusNote: '',
        statusUpdates: [],
        materials: t.materials.map(m => ({
            ...m, 
            isReady: !!m.fileId, // Keep ready if it has a file
            // Make sure materials in templates are marked as REFERENCE by default if they have files?
            // Or keep original category? 
            // If I save a matter as template, the existing deliverables become references for the new template.
            category: 'REFERENCE' as const
        }))
      }))
    }));

    const newTemplate: Template = {
      id: uuid(),
      name: templateName,
      description: `基于 "${matterToTemplate.title}" 创建的自定义模板`,
      stages: cleanStages
    };

    const updatedTemplates = [...templates, newTemplate];
    
    saveTemplates(updatedTemplates);
    setTemplates(updatedTemplates);
    
    setIsSaveTemplateModalOpen(false);
    setMatterToTemplate(null);
    setTemplateName('');
    alert("模板保存成功！");
  };

  // --- Full Template Editing Logic ---

  const handleEditTemplate = (t: Template) => {
      // Convert Template to a temporary Matter
      const tempMatter: Matter = {
          id: `TEMP_${t.id}`,
          title: t.name,
          type: t.description, // Store description in type field for temporary holding
          stages: JSON.parse(JSON.stringify(t.stages)),
          createdAt: Date.now(),
          lastUpdated: Date.now(),
          archived: false
      };

      // Add to matters list temporarily so Board can render it
      setMatters(prev => [...prev, tempMatter]);
      setEditingTemplateId(t.id);
      setActiveMatterId(tempMatter.id);
      setIsTemplateManagerOpen(false);
  };

  const handleSaveTemplateChanges = (m: Matter) => {
      if (!editingTemplateId) return;

      // Clean up stages
      const cleanStages = m.stages.map(s => ({
          ...s,
          tasks: s.tasks.map(t => ({
              ...t,
              status: TaskStatus.PENDING,
              statusNote: '', 
              statusUpdates: [],
              materials: t.materials.map(mat => ({
                  ...mat,
                  isReady: !!mat.fileId, // Keep file state if file exists
              }))
          }))
      }));

      const updatedTemplates = templates.map(t => {
          if (t.id === editingTemplateId) {
              return {
                  ...t,
                  name: m.title, // Matter Title -> Template Name
                  description: m.type, // Matter Type -> Template Description (We mapped this in handleEditTemplate)
                  stages: cleanStages
              };
          }
          return t;
      });

      saveTemplates(updatedTemplates);
      setTemplates(updatedTemplates);

      // Cleanup
      setEditingTemplateId(null);
      setActiveMatterId(null);
      // Remove temp matter
      setMatters(prev => prev.filter(pm => pm.id !== m.id));
      
      alert("模板修改已保存！");
  };

  const cancelTemplateEdit = () => {
      setEditingTemplateId(null);
      setActiveMatterId(null);
      // Clean up temp matters
      setMatters(prev => prev.filter(m => !m.id.startsWith('TEMP_')));
      setIsTemplateManagerOpen(true);
  };

  const createBlankTemplate = () => {
     const newTemplate: Template = {
        id: uuid(),
        name: "新建空白模板",
        description: "自定义空白模板",
        stages: [
            { id: uuid(), title: "阶段一", tasks: [] }
        ]
     };

     const updatedTemplates = [...templates, newTemplate];
     saveTemplates(updatedTemplates);
     setTemplates(updatedTemplates);
  };

  const handleDeleteTemplate = (templateId: string) => {
    if(!confirm("确定删除此模板吗？")) return;
    const updated = templates.filter(t => t.id !== templateId);
    saveTemplates(updated);
    setTemplates(updated);
  };

  // --- Views ---

  const NewMatterView = () => {
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');

    const handleSubmit = () => {
      if (selectedTemplate && title) {
        handleCreateMatter(selectedTemplate, title, date);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full flex overflow-hidden max-h-[85vh]">
          {/* Left: Template Selection */}
          <div className="w-5/12 border-r border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-950">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
               <h2 className="text-lg font-bold text-slate-800 dark:text-white">选择业务类型</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div 
                  onClick={() => setSelectedTemplate({ id: 'custom', name: '空白通用事项', description: '从零开始记录，无预设流程', stages: [] })}
                  className={`border border-dashed rounded-lg p-4 cursor-pointer transition-all ${
                    selectedTemplate?.id === 'custom' 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500' 
                    : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Plus size={16} className="text-slate-500 dark:text-slate-400"/>
                    <h3 className="font-semibold text-slate-700 dark:text-slate-200">空白事项</h3>
                  </div>
                  <p className="text-xs text-slate-400">适用于非常规专项工作</p>
                </div>

              {templates.map(t => (
                <div 
                  key={t.id} 
                  onClick={() => setSelectedTemplate(t)}
                  className={`border rounded-lg p-4 cursor-pointer transition-all relative group ${
                    selectedTemplate?.id === t.id 
                    ? 'border-blue-500 bg-white dark:bg-slate-800 ring-1 ring-blue-500 shadow-md' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 bg-white dark:bg-slate-800 shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h3 className={`font-semibold text-sm ${selectedTemplate?.id === t.id ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{t.name}</h3>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{t.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Details */}
          <div className="w-7/12 p-8 flex flex-col bg-white dark:bg-slate-900">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-8">开始新工作</h2>
            
            <div className="space-y-6 flex-1">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">事项名称 <span className="text-red-500">*</span></label>
                <input 
                  type="text" 
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：XX项目公司注销"
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow bg-transparent dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">预计完成日期</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-3 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow bg-transparent dark:text-white"
                />
                <p className="text-xs text-slate-400 mt-2">临期前 7 天将在工作台置顶提醒。</p>
              </div>

              {selectedTemplate && (
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-100 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
                   已选模板：<span className="font-bold text-slate-800 dark:text-white">{selectedTemplate.name}</span>
                   <div className="mt-1 text-xs text-slate-400">包含 {selectedTemplate.stages.length} 个阶段</div>
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button 
                onClick={() => setIsNewMatterModalOpen(false)}
                className="px-6 py-2.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-medium transition-colors"
              >
                取消
              </button>
              <button 
                disabled={!selectedTemplate || !title}
                onClick={handleSubmit}
                className="flex-1 py-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-200 dark:shadow-none font-medium"
              >
                创建事项
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const SettingsModal = () => (
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[70] p-4 backdrop-blur-sm" onClick={() => !isProcessingBackup && setIsSettingsOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-sm w-full p-6 animate-scaleIn" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                  <Database size={20} className="text-slate-500 dark:text-slate-400" /> 数据与备份
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                  您的数据存储在浏览器本地。清除缓存可能会导致数据丢失。建议定期备份数据。<br/>
                  <span className="text-xs text-slate-400 opacity-80 mt-1 block">备份包包含所有事项数据及附件文件。</span>
              </p>
              
              <div className="space-y-3">
                  <button 
                    onClick={handleExportData}
                    disabled={isProcessingBackup}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                  >
                      {isProcessingBackup ? '处理中...' : <><Download size={18} /> 导出完整备份 (.zip)</>}
                  </button>
                  
                  <div className="relative">
                      <button 
                        disabled={isProcessingBackup}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                      >
                         {isProcessingBackup ? '处理中...' : <><Upload size={18} /> 恢复数据 (.zip)</>}
                      </button>
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".zip"
                        disabled={isProcessingBackup}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full disabled:cursor-not-allowed"
                        onChange={handleImportData}
                      />
                  </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                  <button onClick={() => setIsSettingsOpen(false)} disabled={isProcessingBackup} className="text-slate-500 hover:text-slate-800 dark:hover:text-white font-medium text-sm disabled:opacity-50">关闭</button>
              </div>
          </div>
      </div>
  );

  const activeMatter = matters.find(m => m.id === activeMatterId);

  return (
    <>
      {activeMatterId && activeMatter ? (
        <MatterBoard 
          matter={activeMatter} 
          targetTaskId={targetTaskId}
          onUpdate={handleUpdateMatter}
          onBack={editingTemplateId ? cancelTemplateEdit : () => { setActiveMatterId(null); setTargetTaskId(null); }}
          onSaveTemplate={editingTemplateId ? handleSaveTemplateChanges : initiateSaveTemplate}
          onDeleteMatter={handleDeleteMatter}
          isTemplateMode={!!editingTemplateId}
          theme={theme}
          onThemeChange={setTheme}
        />
      ) : (
        <Dashboard 
          matters={matters}
          onSelectMatter={setActiveMatterId}
          onJumpToTask={handleJumpToTask}
          onNewMatter={() => setIsNewMatterModalOpen(true)}
          onOpenTemplateManager={() => setIsTemplateManagerOpen(true)}
          onDeleteMatter={handleDeleteMatter}
          theme={theme}
          onThemeChange={setTheme}
          notifPermission={notifPermission}
          onRequestNotif={requestNotificationPermission}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      )}
      
      {isNewMatterModalOpen && <NewMatterView />}
      {isSettingsOpen && <SettingsModal />}
      
      <TemplateManagerModal 
         isOpen={isTemplateManagerOpen}
         onClose={() => setIsTemplateManagerOpen(false)}
         templates={templates}
         onCreate={createBlankTemplate}
         onEdit={handleEditTemplate}
         onDelete={handleDeleteTemplate}
      />
      
      {/* Save Template Modal Overlay */}
      {isSaveTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
           <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full p-6 animate-scaleIn">
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">另存为模板</h3>
              <div className="mb-4">
                 <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">模板名称</label>
                 <input 
                    autoFocus
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-transparent text-slate-900 dark:text-white rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                 />
                 <p className="text-xs text-slate-500 mt-2">
                   将保存当前事项的阶段、任务结构。状态和备注信息不会被保存。<br/>
                   <span className="text-blue-500 font-medium">注意：所有当前附件将自动转换为“参考模板”资料。</span>
                 </p>
              </div>
              <div className="flex justify-end gap-2">
                 <button onClick={() => setIsSaveTemplateModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">取消</button>
                 <button onClick={confirmSaveTemplate} disabled={!templateName} className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded hover:bg-slate-700 dark:hover:bg-slate-200 disabled:opacity-50">保存模板</button>
              </div>
           </div>
        </div>
      )}
    </>
  );
};

export default App;