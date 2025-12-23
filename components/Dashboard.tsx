import React, { useState } from 'react';
import { Matter, TaskStatus, Task, Stage } from '../types';
import { 
  Plus, CheckCircle, AlertOctagon, Calendar, Trash2, LayoutTemplate, 
  ArrowRight, AlertCircle, Clock, Activity, CheckSquare, X, Archive,
  Moon, Sun, SunMoon, Database, ChevronDown, ChevronUp, PieChart, EyeOff
} from 'lucide-react';

interface Props {
  matters: Matter[];
  onSelectMatter: (id: string) => void;
  onJumpToTask: (matterId: string, taskId: string) => void;
  onNewMatter: () => void;
  onOpenTemplateManager: () => void;
  onDeleteMatter: (id: string) => void;
  onUpdateMatter: (m: Matter) => void; // Added for dismiss functionality
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (t: 'light' | 'dark' | 'system') => void;
  notifPermission: NotificationPermission;
  onRequestNotif: () => void;
  onOpenSettings: () => void;
}

interface AttentionMatterGroup {
  matter: Matter;
  tasks: { task: Task; stage: Stage; type: 'blocked' | 'exception' }[];
  isOverdue: boolean;
  daysLeft?: number;
}

// Reusable Matter Card Component
const MatterCard: React.FC<{
  m: Matter;
  type: 'normal' | 'completed' | 'archived';
  onSelectMatter: (id: string) => void;
  onDeleteMatter: (id: string) => void;
  hasAttention: boolean;
}> = ({ m, type, onSelectMatter, onDeleteMatter, hasAttention }) => {
  const allTasks = m.stages.flatMap(s => s.tasks);
  const completed = allTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
  const total = allTasks.length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const daysLeft = m.dueDate ? Math.ceil((m.dueDate - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  // Visual style based on type
  let containerClass = "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-500 shadow-sm hover:shadow-md";
  if (type === 'completed') {
    containerClass = "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/50 hover:border-emerald-300 shadow-sm";
  } else if (type === 'archived') {
    containerClass = "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700/50 opacity-70 grayscale hover:grayscale-0 hover:opacity-100 transition-all";
  }

  return (
    <div 
      onClick={() => onSelectMatter(m.id)}
      className={`
        p-5 rounded-xl border cursor-pointer group relative flex flex-col h-full transition-all duration-300
        ${containerClass}
      `}
    >
      <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity z-20">
         <button 
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { 
              e.preventDefault();
              e.stopPropagation(); 
              onDeleteMatter(m.id); 
            }}
            className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-red-500 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors bg-white/80 dark:bg-slate-800/80 shadow-sm border border-slate-100 dark:border-slate-700"
            title="删除事项"
         >
            <Trash2 size={16} />
         </button>
      </div>

      <div className="flex justify-between items-start mb-3">
         <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate text-base">{m.title}</h3>
                {hasAttention && type === 'normal' && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                        <AlertCircle size={10} /> 待关注
                    </span>
                )}
                {type === 'archived' && (
                    <span className="shrink-0 text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
                        已归档
                    </span>
                )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{m.type}</p>
         </div>
      </div>

      <div className="mt-auto space-y-3">
        <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500 dark:text-slate-400">总体进度</span>
            <span className="font-bold text-slate-700 dark:text-slate-200">{progress}%</span>
        </div>
        <div className="w-full bg-slate-200/50 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
          <div className={`h-1.5 rounded-full ${type === 'completed' ? 'bg-emerald-500' : type === 'archived' ? 'bg-slate-400' : 'bg-slate-800 dark:bg-slate-200'}`} style={{ width: `${progress}%` }}></div>
        </div>
        
        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
           <div className="flex items-center gap-1">
             <CheckCircle size={12}/> {completed}/{total} 任务
           </div>
           {m.dueDate && type !== 'archived' && (
             <div className={`flex items-center gap-1 ${daysLeft! < 0 ? 'text-red-500 font-bold' : daysLeft! <= 7 ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}`}>
                <Calendar size={12} /> 
                {daysLeft! < 0 ? `逾期 ${Math.abs(daysLeft!)} 天` : daysLeft === 0 ? '今天到期' : `${daysLeft} 天后`}
             </div>
           )}
        </div>
      </div>
    </div>
   );
};

// Grouped Attention Card
const AttentionGroupCard: React.FC<{
  group: AttentionMatterGroup;
  onSelectMatter: (id: string) => void;
  onJumpToTask: (matterId: string, taskId: string) => void;
  onDismiss: () => void;
}> = ({ group, onSelectMatter, onJumpToTask, onDismiss }) => {
  return (
      <div 
        className="bg-white dark:bg-slate-800 rounded-xl border border-amber-200 dark:border-amber-900 shadow-sm flex flex-col h-full relative overflow-hidden hover:shadow-md transition-all group"
      >
         {/* Dismiss Button - Appears on hover or visible on mobile */}
         <div className="absolute top-2 right-2 z-20">
             <button 
               onClick={(e) => { e.stopPropagation(); onDismiss(); }}
               className="p-1.5 rounded-full bg-white/80 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-all"
               title="不再提示 (Ignore)"
             >
                 <EyeOff size={14} />
             </button>
         </div>

         <div className="bg-amber-50/50 dark:bg-amber-900/20 p-3 border-b border-amber-100 dark:border-amber-900/50 flex justify-between items-start cursor-pointer hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors" onClick={() => onSelectMatter(group.matter.id)}>
            <div className="pr-8">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-0.5">急需关注</div>
                <div className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{group.matter.title}</div>
            </div>
            {group.isOverdue && (
                <div className="flex items-center gap-1 text-red-500 text-xs font-bold bg-white dark:bg-slate-700 px-2 py-1 rounded-full shadow-sm mr-6">
                    <Clock size={12} /> {group.daysLeft && group.daysLeft < 0 ? `逾期 ${Math.abs(group.daysLeft)} 天` : '即将到期'}
                </div>
            )}
         </div>
         
         <div className="p-3 space-y-2 flex-1 bg-white dark:bg-slate-800">
            {group.tasks.length > 0 ? (
                group.tasks.map((item, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => onJumpToTask(group.matter.id, item.task.id)}
                        className={`
                            p-2 rounded border cursor-pointer flex items-center gap-2 transition-all hover:shadow-sm
                            ${item.type === 'blocked' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200' : 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200'}
                        `}
                    >
                        {item.type === 'blocked' ? <AlertOctagon size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                        <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate">{item.task.title}</div>
                            <div className="text-[10px] opacity-70 truncate">{item.stage.title}</div>
                        </div>
                        <ArrowRight size={12} className="opacity-50" />
                    </div>
                ))
            ) : (
                <div className="text-xs text-slate-400 italic p-2">仅因临期提醒</div>
            )}
         </div>
         
         <div 
            onClick={() => onSelectMatter(group.matter.id)}
            className="p-2 text-center bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer font-medium transition-colors"
         >
            查看详情
         </div>
      </div>
  )
};

// Detailed Stat Card for In Progress & Attention
const DetailedStatCard = ({ label, matters, icon: Icon, color, count }: any) => {
    // Count matters by type
    const breakdown = matters.reduce((acc: any, m: Matter) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
    }, {});
    
    // Sort counts descending
    const sortedTypes = Object.entries(breakdown).sort((a: any, b: any) => b[1] - a[1]);

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-full min-h-[140px]">
             <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${color} bg-opacity-10 dark:bg-opacity-20`}>
                    <Icon size={18} className={color.replace('bg-', 'text-').replace('500', '600 dark:text-400')} />
                </div>
                <div className="flex-1">
                    <div className="text-2xl font-bold text-slate-800 dark:text-white leading-none">{count}</div>
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mt-0.5">{label}</div>
                </div>
             </div>
             
             <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[120px] pr-1">
                 {sortedTypes.length > 0 ? (
                     sortedTypes.map(([type, c]: any) => (
                         <div key={type} className="flex justify-between items-center text-xs">
                             <span className="text-slate-600 dark:text-slate-300 truncate pr-2 flex-1" title={type}>{type}</span>
                             <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-full font-bold text-[10px] min-w-[20px] text-center">{c}</span>
                         </div>
                     ))
                 ) : (
                     <div className="text-xs text-slate-300 dark:text-slate-600 italic mt-2">暂无数据</div>
                 )}
             </div>
        </div>
    );
};

const Dashboard: React.FC<Props> = ({ 
  matters, 
  onSelectMatter, 
  onJumpToTask,
  onNewMatter, 
  onOpenTemplateManager,
  onDeleteMatter,
  onUpdateMatter,
  theme,
  onThemeChange,
  notifPermission,
  onRequestNotif,
  onOpenSettings
}) => {
  const now = Date.now();
  
  // Interaction State for Weakened Cards
  const [showCompleted, setShowCompleted] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Separate Active (Not Archived) and Archived
  const activeMatters = matters.filter(m => !m.archived);
  const archivedMatters = matters.filter(m => m.archived);

  // From Active Matters, separate by completion status for Stats logic
  const completedActiveMatters = activeMatters.filter(m => 
    m.stages.length > 0 && m.stages.every(s => s.tasks.every(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.SKIPPED))
  );
  
  const inProgressMatters = activeMatters.filter(m => !completedActiveMatters.some(cm => cm.id === m.id));

  // --- Group Attention Logic (Only for In Progress Matters) ---
  const attentionGroups: AttentionMatterGroup[] = [];

  inProgressMatters.forEach(m => {
    const ignored = m.dismissedAttentionIds || [];
    const tasks: { task: Task; stage: Stage; type: 'blocked' | 'exception' }[] = [];
    let isOverdue = false;
    let daysLeft = undefined;

    // Check overdue, unless ignored
    if (m.dueDate) {
        daysLeft = Math.ceil((m.dueDate - now) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 7 && !ignored.includes('OVERDUE')) {
            isOverdue = true;
        }
    }

    m.stages.forEach(s => {
        s.tasks.forEach(t => {
            // Check if task is already ignored
            if (ignored.includes(t.id)) return;

            if (t.status === TaskStatus.BLOCKED) {
                tasks.push({ task: t, stage: s, type: 'blocked' });
            } else if (t.status === TaskStatus.EXCEPTION) {
                tasks.push({ task: t, stage: s, type: 'exception' });
            }
        });
    });

    if (isOverdue || tasks.length > 0) {
        attentionGroups.push({
            matter: m,
            tasks,
            isOverdue,
            daysLeft
        });
    }
  });

  const handleDismissAttention = (group: AttentionMatterGroup) => {
     if (!confirm("确定暂时忽略这些提醒吗？\n如果后续有新的卡点或异常，卡片会再次出现。")) return;

     const idsToIgnore = group.tasks.map(t => t.task.id);
     if (group.isOverdue) idsToIgnore.push('OVERDUE');
     
     const currentIgnored = group.matter.dismissedAttentionIds || [];
     const newIgnored = [...currentIgnored, ...idsToIgnore];

     // Use Set to unique
     const uniqueIgnored = Array.from(new Set(newIgnored));
     
     onUpdateMatter({
         ...group.matter,
         dismissedAttentionIds: uniqueIgnored,
         lastUpdated: Date.now()
     });
  };

  // --- Statistics Logic ---
  const statInProgressMatters = inProgressMatters.length;
  const statUrgentMatters = attentionGroups.length;
  const statCompletedMatters = completedActiveMatters.length;
  const statArchivedMatters = archivedMatters.length;

  const renderMiniList = (list: Matter[], type: 'completed' | 'archived') => {
      if (list.length === 0) return <div className="p-4 text-center text-xs text-slate-400">列表为空</div>;
      
      return (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl mt-2 border border-slate-100 dark:border-slate-800">
              {list.map(m => {
                    const allTasks = m.stages.flatMap(s => s.tasks);
                    const completed = allTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
                    const total = allTasks.length;
                    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
                    
                    return (
                        <div 
                            key={m.id} 
                            onClick={() => onSelectMatter(m.id)}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col"
                        >
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex-1 min-w-0 pr-2">
                                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate text-sm">{m.title}</div>
                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{m.type}</div>
                                </div>
                                <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${type === 'completed' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                                    {progress}%
                                </div>
                            </div>
                            <div className="text-[10px] text-slate-400 flex justify-between mt-2">
                                <span>{completed}/{total} 任务</span>
                                <span>{new Date(m.lastUpdated).toLocaleDateString()}</span>
                            </div>
                        </div>
                    )
              })}
         </div>
      );
  }

  const getThemeIcon = () => {
    switch(theme) {
      case 'dark': return <Moon size={16} />;
      case 'light': return <Sun size={16} />;
      default: return <SunMoon size={16} />;
    }
  };

  return (
    // Updated: Use min-h-[100dvh] to ensure background covers all overscroll areas.
    <div className="min-h-[100dvh] w-full flex flex-col bg-[#f8fafc] dark:bg-[#020617] relative">
      
      {/* 
          Sticky Header
      */}
      <header className="fixed top-0 left-0 right-0 z-50 h-16 
        bg-white/20 dark:bg-slate-900/20 
        backdrop-blur-xl backdrop-saturate-150 
        border-b border-slate-200/50 dark:border-slate-800/50 
        flex items-center justify-between px-6 transition-all duration-300">
        
        <div className="flex items-center gap-3">
             {/* Logo: Orbit */}
             <div className="flex items-center gap-2 group cursor-default">
                 <div className="h-9 w-9 relative rounded-[22%] bg-gradient-to-br from-slate-700 to-black shadow-lg shadow-slate-300/50 dark:shadow-black/50 flex items-center justify-center overflow-hidden ring-1 ring-white/20 transition-transform group-hover:scale-105">
                     <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent"></div>
                     <span className="text-white font-black text-sm tracking-tighter z-10">Or</span>
                     <div className="absolute bottom-[-5px] right-[-5px] w-5 h-5 bg-blue-500 blur-md opacity-40"></div>
                 </div>
                 <span className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Orbit</span>
             </div>
        </div>
        
        <div className="flex items-center gap-3">
          
          {/* Theme Toggle */}
          <button 
             onClick={() => {
                if(theme === 'system') onThemeChange('light');
                else if(theme === 'light') onThemeChange('dark');
                else onThemeChange('system');
             }}
             className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
             title="切换主题"
          >
             {getThemeIcon()}
          </button>

          <button
             onClick={onOpenSettings}
             className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
             title="设置与备份"
          >
             <Database size={18} />
          </button>

          <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 hidden md:block"></div>

          <button 
             onClick={onOpenTemplateManager}
             className="flex items-center gap-2 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg hover:bg-white/50 dark:hover:bg-slate-800 transition-colors font-medium text-xs md:text-sm border border-transparent hover:border-slate-200/50"
          >
            <LayoutTemplate size={18} /> <span className="hidden md:inline">模板管理</span>
          </button>
          <button 
              onClick={onNewMatter}
              className="flex items-center gap-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 rounded-lg hover:bg-slate-800 dark:hover:bg-white/90 transition-colors shadow-lg shadow-slate-200 dark:shadow-none font-medium text-sm"
          >
              <Plus size={18} /> <span className="hidden md:inline">新建事项</span>
          </button>
        </div>
      </header>

      {/* Content Area - Scrolls independently */}
      <div className="flex-1 w-full pt-20">
        {/* ADD PADDING BOTTOM FOR SAFE AREA TO PREVENT CONTENT HIDING BEHIND HOME BAR */}
        <div className="max-w-7xl mx-auto p-6 min-h-full pb-[calc(5rem+env(safe-area-inset-bottom))]">
            
            {/* 
                STATS AREA 
            */}
            <div className="mb-8 mt-4">
                 {/* Row 1: Primary Stats (Expanded by Type) */}
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                     <DetailedStatCard 
                        label="正在推进"
                        matters={inProgressMatters}
                        count={statInProgressMatters}
                        icon={Activity}
                        color="bg-blue-500"
                     />
                     <DetailedStatCard 
                        label="急需关注"
                        matters={attentionGroups.map(g => g.matter)}
                        count={statUrgentMatters}
                        icon={AlertCircle}
                        color="bg-amber-500"
                     />
                 </div>

                 {/* Row 2: Secondary Stats (Weakened / Expandable) */}
                 <div className="flex flex-col gap-2">
                     {/* Completed Expandable */}
                     <div className="bg-transparent">
                         <button 
                            onClick={() => setShowCompleted(!showCompleted)}
                            className={`
                                flex items-center justify-between w-full p-3 rounded-lg border transition-all text-sm
                                ${showCompleted 
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 shadow-sm' 
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:border-slate-300'}
                            `}
                         >
                            <div className="flex items-center gap-2">
                                <div className={`p-1 rounded-full ${showCompleted ? 'bg-emerald-200 dark:bg-emerald-800' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                    <CheckSquare size={14} className={showCompleted ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'} />
                                </div>
                                <span className="font-medium">已完成事项</span>
                                <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full text-xs font-bold">{statCompletedMatters}</span>
                            </div>
                            {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                         </button>
                         <div className={`overflow-hidden transition-all duration-300 ease-out ${showCompleted ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                              {renderMiniList(completedActiveMatters, 'completed')}
                         </div>
                     </div>

                     {/* Archived Expandable */}
                     <div className="bg-transparent">
                         <button 
                            onClick={() => setShowArchived(!showArchived)}
                            className={`
                                flex items-center justify-between w-full p-3 rounded-lg border transition-all text-sm
                                ${showArchived 
                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 shadow-sm' 
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:border-slate-300'}
                            `}
                         >
                            <div className="flex items-center gap-2">
                                <div className={`p-1 rounded-full ${showArchived ? 'bg-slate-300 dark:bg-slate-600' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                    <Archive size={14} className={showArchived ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'} />
                                </div>
                                <span className="font-medium">已归档事项</span>
                                <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full text-xs font-bold">{statArchivedMatters}</span>
                            </div>
                            {showArchived ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                         </button>
                         <div className={`overflow-hidden transition-all duration-300 ease-out ${showArchived ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}>
                              {renderMiniList(archivedMatters, 'archived')}
                         </div>
                     </div>
                 </div>
            </div>

            <div className="space-y-12">
                {/* Section 1: Attention Needed */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
                        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">急需关注</h2>
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold">{attentionGroups.length}</span>
                    </div>
                    {attentionGroups.length === 0 ? (
                        <div className="text-sm text-slate-400 pl-4 py-6 bg-slate-50/50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center gap-2">
                           <CheckCircle size={16} /> 暂无受阻或临期事项，一切正常。
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        {attentionGroups.map((group, idx) => (
                            <AttentionGroupCard 
                                key={group.matter.id} 
                                group={group}
                                onSelectMatter={onSelectMatter}
                                onJumpToTask={onJumpToTask}
                                onDismiss={() => handleDismissAttention(group)}
                            />
                        ))}
                        </div>
                    )}
                </section>

                {/* Section 2: In Progress */}
                <section>
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                    <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">正在推进</h2>
                    <span className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-bold">{inProgressMatters.length}</span>
                </div>
                {inProgressMatters.length === 0 ? (
                    <div className="text-sm text-slate-400 pl-4 py-8 text-center bg-slate-50/50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                    暂无常规推进中的事项。
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {inProgressMatters.map(m => (
                        <MatterCard 
                        key={m.id} 
                        m={m} 
                        type="normal" 
                        onSelectMatter={onSelectMatter}
                        onDeleteMatter={onDeleteMatter}
                        hasAttention={attentionGroups.some(ag => ag.matter.id === m.id)}
                        />
                    ))}
                    </div>
                )}
                </section>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;