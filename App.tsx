import React, { useState, useEffect, useRef } from 'react';
import { Matter, Template, TaskStatus, Task, Stage, JudgmentRecord } from './types';
import { ALL_TEMPLATES, SPV_DEREGISTRATION_TEMPLATE } from './constants';
import MatterBoard from './components/MatterBoard';
import Dashboard from './components/Dashboard';
import { Plus, Trash2, LayoutTemplate, X, Check, Edit2, Save, Database, Upload, Download, Settings, Key, Server, Sparkles, FileText, Zap, ListChecks, Layers } from 'lucide-react';
import JSZip from 'jszip';
import { getFile, saveFile } from './services/storage';
import { generateTemplateFromText, generateMatterFromText } from './services/aiAnalysisService';

// --- Local Storage Helpers ---
const STORAGE_KEY = 'opus_matters_v1';
const TEMPLATE_KEY = 'opus_templates_v1';
const THEME_KEY = 'opus_theme_v1';
export const SETTINGS_KEY = 'opus_settings_v1'; // Export for services to use

const saveMatters = (matters: Matter[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(matters));
};

// Helper to generate IDs
const uuid = () => Math.random().toString(36).substr(2, 9);

const loadMatters = (): Matter[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) return JSON.parse(data);

  // --- DEMO DATA GENERATION FOR FIRST TIME USERS ---
  const demoMatter: Matter = {
      id: uuid(),
      title: '昌邑航通公司注销',
      type: '外资SPV简易注销流程',
      dueDate: Date.now() + 1000 * 60 * 60 * 24 * 14, // Due in 2 weeks
      createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5, // Created 5 days ago
      lastUpdated: Date.now(),
      archived: false,
      stages: JSON.parse(JSON.stringify(SPV_DEREGISTRATION_TEMPLATE.stages)),
      dismissedAttentionIds: [],
      judgmentTimeline: [],
      overallStatus: TaskStatus.IN_PROGRESS
  };

  // Populate Demo Data Status
  // Stage 1: Internal Decision
  if (demoMatter.stages[0]) {
      const s1 = demoMatter.stages[0];
      // 1. 编制注销方案 -> Completed
      if (s1.tasks[0]) {
          s1.tasks[0].status = TaskStatus.COMPLETED;
          s1.tasks[0].statusNote = "已按集团最新模板编制，法务部已审核通过。";
          if (s1.tasks[0].materials[0]) s1.tasks[0].materials[0].isReady = true; // Mock file ready
      }
      // 2. 报局战发部上会审议 -> Completed
      if (s1.tasks[1]) {
          s1.tasks[1].status = TaskStatus.COMPLETED;
      }
      // 3. 香港航通发起注销请示 -> Blocked (Showcase Blocking)
      if (s1.tasks[2]) {
          s1.tasks[2].status = TaskStatus.BLOCKED;
          s1.tasks[2].statusUpdates = [{
              id: uuid(),
              content: "已邮件发送至香港秘书公司，等待董事签字决议。对方回复预计需3个工作日（至下周一）。",
              timestamp: Date.now() - 1000 * 60 * 60 * 4
          }];
      }
      // 4. 获取局战发部批复 -> Pending
  }

  // Stage 2: Prep -> In Progress
  if (demoMatter.stages[1]) {
      const s2 = demoMatter.stages[1];
       // 1. 签署承诺书 -> In Progress
      if (s2.tasks[0]) {
          s2.tasks[0].status = TaskStatus.IN_PROGRESS;
          s2.tasks[0].statusUpdates = [{
              id: uuid(),
              content: "文本已定稿，正在走内部印章申请流程 (OA流程号: 20240520001)。",
              timestamp: Date.now() - 1000 * 60 * 60 * 24
          }];
      }
  }
  
  // ADD DEMO JUDGMENT
  demoMatter.judgmentTimeline = [
      {
          id: uuid(),
          content: "当前主要卡点在于香港航通的董事会决议签署进度。虽然已邮件催促，但考虑到跨境沟通时效，预计仍需3天左右。同步正在推进内部印章申请，确保决议一下来就能立即提交公示，目前整体可控。",
          status: TaskStatus.BLOCKED,
          timestamp: Date.now() - 1000 * 60 * 60 * 2
      },
      {
          id: uuid(),
          content: "已完成前期注销方案的内部审批，所有前置条件均已满足。准备启动简易注销流程。",
          status: TaskStatus.IN_PROGRESS,
          timestamp: Date.now() - 1000 * 60 * 60 * 48
      }
  ];
  demoMatter.currentSituation = demoMatter.judgmentTimeline[0].content;
  demoMatter.overallStatus = TaskStatus.BLOCKED;

  saveMatters([demoMatter]);
  return [demoMatter];
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

const AITemplateGeneratorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (t: Template) => void;
}> = ({ isOpen, onClose, onConfirm }) => {
    const [text, setText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    if (!isOpen) return null;

    const handleGenerate = async () => {
        if (!text.trim()) return;
        setIsGenerating(true);
        const template = await generateTemplateFromText(text);
        setIsGenerating(false);
        if (template) {
            // Assign a real ID
            template.id = uuid();
            onConfirm(template);
            onClose();
            setText('');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[80] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg p-6 animate-scaleIn" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                        <Sparkles size={20} /> AI 智能生成模板
                    </h3>
                    <button onClick={onClose}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                    粘贴您的工作总结、流程说明或操作手册片段，AI 将自动分析并生成结构化的事项模板。
                </p>
                <textarea 
                    className="w-full h-40 p-3 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none mb-4"
                    placeholder="例如：完成一家公司注销通常需要先进行内部决议，然后成立清算组，发布公告45天。之后清理资产，最后去工商局注销..."
                    value={text}
                    onChange={e => setText(e.target.value)}
                />
                <button 
                    onClick={handleGenerate}
                    disabled={!text.trim() || isGenerating}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {isGenerating ? <><Sparkles size={16} className="animate-spin"/> 分析生成中...</> : '开始生成'}
                </button>
            </div>
        </div>
    );
};

const TemplateManagerModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    templates: Template[];
    onCreate: () => void;
    onEdit: (t: Template) => void;
    onDelete: (id: string) => void;
    onAIImport: () => void;
}> = ({ isOpen, onClose, templates, onCreate, onEdit, onDelete, onAIImport }) => {
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
                            <div className="flex gap-3">
                                <button onClick={onAIImport} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium">
                                    <Sparkles size={12} /> AI 导入
                                </button>
                                <button onClick={onCreate} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                                    <Plus size={12} /> 新建空白
                                </button>
                            </div>
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
  const [isAIGenOpen, setIsAIGenOpen] = useState(false);
  
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
      archived: false,
      judgmentTimeline: []
    };
    const updated = [newMatter, ...matters];
    setMatters(updated);
    saveMatters(updated);
    setIsNewMatterModalOpen(false);
    setActiveMatterId(newMatter.id);
  };

  const handleCreateMatterDirectly = (title: string, dueDate: string | null, stages: { title: string; tasks: { title: string }[] }[], isSimple: boolean) => {
      const newMatter: Matter = {
          id: uuid(),
          title: title,
          type: isSimple ? '快速任务' : 'AI 智能录入',
          dueDate: dueDate ? new Date(dueDate).getTime() : undefined,
          createdAt: Date.now(),
          lastUpdated: Date.now(),
          stages: stages.map(s => ({
              id: uuid(),
              title: s.title,
              tasks: s.tasks.map(t => ({
                  id: uuid(),
                  title: t.title,
                  status: TaskStatus.PENDING,
                  statusNote: '',
                  statusUpdates: [],
                  materials: [],
                  lastUpdated: Date.now()
              }))
          })),
          archived: false,
          judgmentTimeline: [],
          overallStatus: TaskStatus.PENDING,
          currentSituation: "AI 自动生成事项，请补充细节。"
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
                                  // Legacy
                                  if (mat.fileId) fileIds.add(mat.fileId);
                                  // New
                                  if (mat.files) {
                                      mat.files.forEach(f => fileIds.add(f.id));
                                  }
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
                      const fileId = zipEntry.name.split('/').pop(); 
                      if (fileId) {
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
            isReady: !!m.fileId || (m.files && m.files.length > 0),
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
          archived: false,
          judgmentTimeline: []
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
                  isReady: !!mat.fileId || (mat.files && mat.files.length > 0), 
              }))
          }))
      }));

      const updatedTemplates = templates.map(t => {
          if (t.id === editingTemplateId) {
              return {
                  ...t,
                  name: m.title, // Matter Title -> Template Name
                  description: m.type, // Matter Type -> Template Description
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

  const handleAITemplateCreated = (t: Template) => {
      const updatedTemplates = [...templates, t];
      saveTemplates(updatedTemplates);
      setTemplates(updatedTemplates);
      alert("AI 模板生成成功！");
      // Optional: Auto open edit mode
      // handleEditTemplate(t);
  };

  // --- Views ---

  const NewMatterView = () => {
    const [mode, setMode] = useState<'TEMPLATE' | 'AI'>('TEMPLATE');
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    const [title, setTitle] = useState('');
    const [date, setDate] = useState('');
    
    // AI Mode
    const [aiInput, setAiInput] = useState('');
    const [isGeneratingMatter, setIsGeneratingMatter] = useState(false);
    const [aiModeType, setAiModeType] = useState<'SIMPLE' | 'COMPLEX'>('COMPLEX'); // New State

    const handleSubmit = () => {
      if (selectedTemplate && title) {
        handleCreateMatter(selectedTemplate, title, date);
      }
    };

    const handleAISubmit = async () => {
        if(!aiInput.trim()) return;
        setIsGeneratingMatter(true);
        const result = await generateMatterFromText(aiInput, aiModeType === 'SIMPLE');
        setIsGeneratingMatter(false);
        
        if (result) {
            handleCreateMatterDirectly(result.title, result.dueDate, result.stages, aiModeType === 'SIMPLE');
        }
    };

    return (
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-4xl w-full flex overflow-hidden max-h-[85vh]">
          
          {/* Left Panel: Tabs */}
          <div className="w-5/12 border-r border-slate-100 dark:border-slate-800 flex flex-col bg-slate-50 dark:bg-slate-950">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
               <h2 className="text-lg font-bold text-slate-800 dark:text-white">选择创建方式</h2>
            </div>
            
            <div className="p-2 space-y-2">
                <button 
                    onClick={() => setMode('TEMPLATE')}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all ${mode === 'TEMPLATE' ? 'bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}
                >
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400"><LayoutTemplate size={18} /></div>
                    <div>
                        <div className="font-bold text-sm text-slate-800 dark:text-slate-100">使用模板创建</div>
                        <div className="text-xs text-slate-500">适用于标准化、重复性工作流程</div>
                    </div>
                </button>

                <button 
                    onClick={() => setMode('AI')}
                    className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition-all ${mode === 'AI' ? 'bg-white dark:bg-slate-800 shadow-sm border border-indigo-200 dark:border-indigo-900' : 'hover:bg-slate-100 dark:hover:bg-slate-900'}`}
                >
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600 dark:text-indigo-400"><Sparkles size={18} /></div>
                    <div>
                        <div className="font-bold text-sm text-slate-800 dark:text-slate-100">AI 智能录入</div>
                        <div className="text-xs text-slate-500">自然语言描述，自动生成非标事项</div>
                    </div>
                </button>
            </div>

            {mode === 'TEMPLATE' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 border-t border-slate-200 dark:border-slate-800 max-h-[300px] overscroll-contain">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">可选模板</div>
                    <div 
                        onClick={() => setSelectedTemplate({ id: 'custom', name: '空白通用事项', description: '从零开始记录，无预设流程', stages: [] })}
                        className={`border border-dashed rounded-lg p-3 cursor-pointer transition-all ${
                            selectedTemplate?.id === 'custom' 
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500' 
                            : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-900'
                        }`}
                        >
                        <div className="flex items-center gap-2 mb-1">
                            <Plus size={14} className="text-slate-500 dark:text-slate-400"/>
                            <h3 className="font-semibold text-sm text-slate-700 dark:text-slate-200">空白事项</h3>
                        </div>
                    </div>

                    {templates.map(t => (
                        <div 
                        key={t.id} 
                        onClick={() => setSelectedTemplate(t)}
                        className={`border rounded-lg p-3 cursor-pointer transition-all relative group ${
                            selectedTemplate?.id === t.id 
                            ? 'border-blue-500 bg-white dark:bg-slate-800 ring-1 ring-blue-500 shadow-md' 
                            : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 bg-white dark:bg-slate-800 shadow-sm'
                        }`}
                        >
                        <div className="flex justify-between items-start">
                            <h3 className={`font-semibold text-sm ${selectedTemplate?.id === t.id ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-slate-200'}`}>{t.name}</h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{t.description}</p>
                        </div>
                    ))}
                </div>
            )}
          </div>

          {/* Right: Content */}
          <div className="w-7/12 p-8 flex flex-col bg-white dark:bg-slate-900">
            {mode === 'TEMPLATE' ? (
                <>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-8">填写基础信息</h2>
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
                </>
            ) : (
                <>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">AI 智能录入</h2>
                    <p className="text-sm text-slate-500 mb-6">描述您的工作内容，AI 将自动提取标题、截止时间并生成任务列表。</p>
                    
                    <div className="flex gap-4 mb-4">
                        <button 
                            onClick={() => setAiModeType('SIMPLE')}
                            className={`flex-1 p-3 rounded-lg border text-left transition-all ${aiModeType === 'SIMPLE' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <ListChecks size={16} className={aiModeType === 'SIMPLE' ? 'text-indigo-600' : 'text-slate-400'}/>
                                <span className={`text-sm font-bold ${aiModeType === 'SIMPLE' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>简单任务模式</span>
                            </div>
                            <p className="text-xs text-slate-500">生成单个待办清单，适合短期任务</p>
                        </button>
                        <button 
                            onClick={() => setAiModeType('COMPLEX')}
                            className={`flex-1 p-3 rounded-lg border text-left transition-all ${aiModeType === 'COMPLEX' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <Layers size={16} className={aiModeType === 'COMPLEX' ? 'text-indigo-600' : 'text-slate-400'}/>
                                <span className={`text-sm font-bold ${aiModeType === 'COMPLEX' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>复杂项目模式</span>
                            </div>
                            <p className="text-xs text-slate-500">自动拆解多个阶段，适合长期项目</p>
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col">
                        <textarea 
                            className="w-full h-40 p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none mb-4"
                            placeholder={aiModeType === 'SIMPLE' ? "例如：下周五前要交一份市场调研报告，需要先搜集数据，然后写大纲，最后完善PPT。" : "例如：启动新公司设立流程，预计耗时2个月。需要先核名，然后去工商局交材料，最后刻章备案。"}
                            value={aiInput}
                            onChange={(e) => setAiInput(e.target.value)}
                        />
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                            <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 mb-1 flex items-center gap-1"><Zap size={12}/> AI 将自动识别：</h4>
                            <ul className="text-xs text-indigo-800 dark:text-indigo-300 list-disc list-inside space-y-0.5 ml-1">
                                <li>事项标题与关键描述</li>
                                <li>截止日期 (如提及)</li>
                                <li>{aiModeType === 'SIMPLE' ? '生成单一待办清单' : '生成分阶段执行计划'}</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <button 
                            onClick={() => setIsNewMatterModalOpen(false)}
                            className="px-6 py-2.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white font-medium transition-colors"
                        >
                            取消
                        </button>
                        <button 
                            onClick={handleAISubmit}
                            disabled={!aiInput.trim() || isGeneratingMatter}
                            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                        >
                            {isGeneratingMatter ? <><Sparkles size={16} className="animate-spin"/> 正在生成...</> : '一键生成事项'}
                        </button>
                    </div>
                </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const SettingsModal = () => {
      // AI Settings State
      const [apiKey, setApiKey] = useState('');
      const [apiHost, setApiHost] = useState('https://api.chatanywhere.tech');
      const [isSaving, setIsSaving] = useState(false);

      useEffect(() => {
          const loaded = localStorage.getItem(SETTINGS_KEY);
          if (loaded) {
              const parsed = JSON.parse(loaded);
              setApiKey(parsed.apiKey || '');
              setApiHost(parsed.apiHost || 'https://api.chatanywhere.tech');
          }
      }, []);

      const handleSaveSettings = () => {
          setIsSaving(true);
          const settings = { apiKey, apiHost };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          setTimeout(() => {
              setIsSaving(false);
              alert("配置已保存");
          }, 500);
      };

      return (
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-[70] p-4 backdrop-blur-sm" onClick={() => !isProcessingBackup && setIsSettingsOpen(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-md w-full p-6 animate-scaleIn flex flex-col max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <Settings size={20} className="text-slate-500 dark:text-slate-400" /> 设置
                </h3>
                <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
              </div>

              {/* AI Config Section */}
              <div className="mb-8 border-b border-slate-100 dark:border-slate-800 pb-8">
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                      <Server size={16} className="text-blue-500"/> AI 服务配置
                  </h4>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">API Host (Base URL)</label>
                          <input 
                              className="w-full p-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                              value={apiHost}
                              onChange={(e) => setApiHost(e.target.value)}
                              placeholder="https://api.chatanywhere.tech"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">API Key</label>
                          <div className="relative">
                              <input 
                                  type="password"
                                  className="w-full p-2.5 pl-9 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                  value={apiKey}
                                  onChange={(e) => setApiKey(e.target.value)}
                                  placeholder="sk-..."
                              />
                              <Key size={14} className="absolute left-3 top-3 text-slate-400" />
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1.5">Key 仅存储在本地浏览器中，用于请求 AI 接口。</p>
                      </div>
                      <button 
                          onClick={handleSaveSettings}
                          disabled={isSaving}
                          className="w-full py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-bold hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors disabled:opacity-50"
                      >
                          {isSaving ? '保存中...' : '保存配置'}
                      </button>
                  </div>
              </div>

              {/* Data & Backup Section */}
              <div>
                  <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                      <Database size={16} className="text-emerald-500"/> 数据与备份
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                      您的数据存储在浏览器本地。清除缓存可能会导致数据丢失。建议定期备份数据。<br/>
                  </p>
                  
                  <div className="space-y-3">
                      <button 
                        onClick={handleExportData}
                        disabled={isProcessingBackup}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50 text-xs"
                      >
                          {isProcessingBackup ? '处理中...' : <><Download size={16} /> 导出完整备份 (.zip)</>}
                      </button>
                      
                      <div className="relative">
                          <button 
                            disabled={isProcessingBackup}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 text-xs"
                          >
                             {isProcessingBackup ? '处理中...' : <><Upload size={16} /> 恢复数据 (.zip)</>}
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
              </div>
          </div>
      </div>
  )};

  const activeMatter = matters.find(m => m.id === activeMatterId);

  return (
    <>
      {activeMatterId && activeMatter ? (
        <MatterBoard 
          matter={activeMatter} 
          allMatters={matters}
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
          onUpdateMatter={handleUpdateMatter}
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
         onAIImport={() => setIsAIGenOpen(true)}
      />

      <AITemplateGeneratorModal 
         isOpen={isAIGenOpen}
         onClose={() => setIsAIGenOpen(false)}
         onConfirm={handleAITemplateCreated}
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