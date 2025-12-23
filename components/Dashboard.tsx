import React, { useState } from 'react';
import { Matter, TaskStatus, Task, Stage } from '../types';
import { 
  Plus, CheckCircle, AlertOctagon, Calendar, Trash2, LayoutTemplate, 
  ArrowRight, AlertCircle, Clock, Activity, CheckSquare, X, Archive
} from 'lucide-react';

interface Props {
  matters: Matter[];
  onSelectMatter: (id: string) => void;
  onJumpToTask: (matterId: string, taskId: string) => void;
  onNewMatter: () => void;
  onOpenTemplateManager: () => void;
  onDeleteMatter: (id: string) => void;
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
  let containerClass = "bg-white border-slate-200 hover:border-blue-300 shadow-sm hover:shadow-md";
  if (type === 'completed') {
    containerClass = "bg-emerald-50/50 border-emerald-100 hover:border-emerald-300 shadow-sm";
  } else if (type === 'archived') {
    containerClass = "bg-slate-50 border-slate-100 opacity-70 grayscale hover:grayscale-0 hover:opacity-100 transition-all";
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
            className="h-8 w-8 flex items-center justify-center text-slate-300 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors bg-white/80 shadow-sm border border-slate-100"
            title="删除事项"
         >
            <Trash2 size={16} />
         </button>
      </div>

      <div className="flex justify-between items-start mb-3">
         <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-slate-800 truncate text-base">{m.title}</h3>
                {hasAttention && type === 'normal' && (
                    <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                        <AlertCircle size={10} /> 待关注
                    </span>
                )}
                {type === 'archived' && (
                    <span className="shrink-0 text-[10px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                        已归档
                    </span>
                )}
            </div>
            <p className="text-xs text-slate-500 truncate">{m.type}</p>
         </div>
      </div>

      <div className="mt-auto space-y-3">
        <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500">总体进度</span>
            <span className="font-bold text-slate-700">{progress}%</span>
        </div>
        <div className="w-full bg-slate-200/50 rounded-full h-1.5 overflow-hidden">
          <div className={`h-1.5 rounded-full ${type === 'completed' ? 'bg-emerald-500' : type === 'archived' ? 'bg-slate-400' : 'bg-slate-800'}`} style={{ width: `${progress}%` }}></div>
        </div>
        
        <div className="flex justify-between items-center text-xs text-slate-500">
           <div className="flex items-center gap-1">
             <CheckCircle size={12}/> {completed}/{total} 任务
           </div>
           {m.dueDate && type !== 'archived' && (
             <div className={`flex items-center gap-1 ${daysLeft! < 0 ? 'text-red-500 font-bold' : daysLeft! <= 7 ? 'text-amber-600 font-bold' : ''}`}>
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
}> = ({ group, onSelectMatter, onJumpToTask }) => {
  return (
      <div 
        className="bg-white rounded-xl border border-amber-200 shadow-sm flex flex-col h-full relative overflow-hidden hover:shadow-md transition-all"
      >
         <div className="bg-amber-50/50 p-3 border-b border-amber-100 flex justify-between items-start cursor-pointer hover:bg-amber-100/50 transition-colors" onClick={() => onSelectMatter(group.matter.id)}>
            <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-0.5">急需关注</div>
                <div className="font-bold text-slate-800 text-sm truncate">{group.matter.title}</div>
            </div>
            {group.isOverdue && (
                <div className="flex items-center gap-1 text-red-500 text-xs font-bold bg-white px-2 py-1 rounded-full shadow-sm">
                    <Clock size={12} /> {group.daysLeft && group.daysLeft < 0 ? `逾期 ${Math.abs(group.daysLeft)} 天` : '即将到期'}
                </div>
            )}
         </div>
         
         <div className="p-3 space-y-2 flex-1 bg-white">
            {group.tasks.length > 0 ? (
                group.tasks.map((item, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => onJumpToTask(group.matter.id, item.task.id)}
                        className={`
                            p-2 rounded border cursor-pointer flex items-center gap-2 transition-all hover:shadow-sm
                            ${item.type === 'blocked' ? 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-300' : 'bg-purple-50 border-purple-200 text-purple-800 hover:border-purple-300'}
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
            className="p-2 text-center bg-slate-50 border-t border-slate-100 text-xs text-slate-500 hover:text-blue-600 hover:bg-slate-100 cursor-pointer font-medium transition-colors"
         >
            查看详情
         </div>
      </div>
  )
};

const StatCard = ({ label, value, icon: Icon, color, onClick }: any) => (
  <div 
    onClick={onClick}
    className="bg-white p-4 rounded-xl border border-slate-200 flex items-center gap-4 shadow-sm cursor-pointer hover:shadow-md transition-all hover:border-blue-300 group"
  >
      <div className={`p-3 rounded-lg ${color} bg-opacity-10 group-hover:scale-110 transition-transform`}>
          <Icon size={20} className={color.replace('bg-', 'text-')} />
      </div>
      <div>
          <div className="text-2xl font-bold text-slate-800">{value}</div>
          <div className="text-xs text-slate-500 font-medium uppercase tracking-wide group-hover:text-blue-600 transition-colors">{label}</div>
      </div>
  </div>
);

const Dashboard: React.FC<Props> = ({ 
  matters, 
  onSelectMatter, 
  onJumpToTask,
  onNewMatter, 
  onOpenTemplateManager,
  onDeleteMatter
}) => {
  const now = Date.now();
  const [activeStatModal, setActiveStatModal] = useState<'progress' | 'urgent' | 'completed' | 'archived' | null>(null);

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
    const tasks: { task: Task; stage: Stage; type: 'blocked' | 'exception' }[] = [];
    let isOverdue = false;
    let daysLeft = undefined;

    if (m.dueDate) {
        daysLeft = Math.ceil((m.dueDate - now) / (1000 * 60 * 60 * 24));
        if (daysLeft <= 7) {
            isOverdue = true;
        }
    }

    m.stages.forEach(s => {
        s.tasks.forEach(t => {
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

  // --- Statistics Logic ---
  const statInProgressMatters = inProgressMatters.length;
  const statUrgentMatters = attentionGroups.length;
  const statCompletedMatters = completedActiveMatters.length;
  const statArchivedMatters = archivedMatters.length;

  // --- Modal List Logic ---
  const getModalList = () => {
      switch(activeStatModal) {
          case 'progress': return inProgressMatters;
          case 'urgent': return attentionGroups.map(g => g.matter);
          case 'completed': return completedActiveMatters;
          case 'archived': return archivedMatters;
          default: return [];
      }
  };

  const getModalTitle = () => {
      switch(activeStatModal) {
          case 'progress': return '正在推进';
          case 'urgent': return '急需关注';
          case 'completed': return '已完成（未归档）';
          case 'archived': return '已归档';
          default: return '';
      }
  };

  const StatDetailModal = () => {
      if (!activeStatModal) return null;
      const list = getModalList();

      return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4 backdrop-blur-sm" onClick={() => setActiveStatModal(null)}>
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h2 className="text-lg font-bold text-slate-800">{getModalTitle()}</h2>
                    <button onClick={() => setActiveStatModal(null)} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-[#f8fafc]">
                    {list.length === 0 && <div className="text-slate-400 text-center py-10">暂无相关事项</div>}
                    {list.map(m => {
                         const allTasks = m.stages.flatMap(s => s.tasks);
                         const completed = allTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
                         const total = allTasks.length;
                         const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
                         
                         return (
                             <div 
                                key={m.id} 
                                onClick={() => { onSelectMatter(m.id); setActiveStatModal(null); }}
                                className="border border-slate-200 rounded-xl p-4 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer bg-white"
                             >
                                 <div className="flex justify-between items-start mb-2">
                                     <div>
                                         <div className="font-bold text-slate-800">{m.title}</div>
                                         <div className="text-xs text-slate-500">{m.type}</div>
                                     </div>
                                     <div className="text-sm font-bold text-blue-600">{progress}%</div>
                                 </div>
                                 <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div className="h-1.5 rounded-full bg-slate-800" style={{ width: `${progress}%` }}></div>
                                 </div>
                                 <div className="flex justify-end mt-2 text-xs text-slate-400">
                                     {completed}/{total} 任务
                                 </div>
                             </div>
                         )
                    })}
                </div>
            </div>
        </div>
      );
  };

  return (
    // FIXED: Use h-[100dvh] to prevent address bar shift issues. 
    // FIXED: overscroll-behavior-y: none in CSS (index.html) + class overscroll-y-contain here ensures inner scroll only.
    <div className="h-[100dvh] w-full flex flex-col bg-[#f8fafc] overflow-hidden relative">
      
      {/* 
          Sticky Header
          - Since the parent has overflow-hidden and this container is flex-col, 
          - we need the content area below to scroll, NOT the whole body.
          - We place the header as a flex item (flex-none) so it stays put.
      */}
      <header className="flex-none z-50 h-16 bg-white/75 backdrop-blur-2xl border-b border-slate-200/50 flex items-center justify-between px-6 transition-all duration-300 supports-[backdrop-filter]:bg-white/60">
        <div className="flex items-center gap-3">
             {/* Logo: Orbit */}
             <div className="flex items-center gap-2 group cursor-default">
                 <div className="h-9 w-9 relative rounded-[22%] bg-gradient-to-br from-slate-700 to-black shadow-lg shadow-slate-300/50 flex items-center justify-center overflow-hidden ring-1 ring-white/20 transition-transform group-hover:scale-105">
                     <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent"></div>
                     <span className="text-white font-black text-sm tracking-tighter z-10">Or</span>
                     <div className="absolute bottom-[-5px] right-[-5px] w-5 h-5 bg-blue-500 blur-md opacity-40"></div>
                 </div>
                 <span className="text-xl font-bold text-slate-800 tracking-tight">Orbit</span>
             </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
             onClick={onOpenTemplateManager}
             className="flex items-center gap-2 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors font-medium text-sm border border-slate-200/50 bg-white/50"
          >
            <LayoutTemplate size={18} /> <span className="hidden md:inline">模板管理</span>
          </button>
          <button 
              onClick={onNewMatter}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200 font-medium text-sm"
          >
              <Plus size={18} /> <span className="hidden md:inline">新建事项</span>
          </button>
        </div>
      </header>

      {/* Content Area - Scrolls independently */}
      <div className="flex-1 overflow-y-auto overscroll-y-contain scroll-smooth w-full">
        <div className="max-w-7xl mx-auto p-6 min-h-full pb-20">
            
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                <StatCard 
                    label="正在进行" 
                    value={statInProgressMatters} 
                    icon={Activity} 
                    color="bg-blue-500" 
                    onClick={() => setActiveStatModal('progress')}
                />
                <StatCard 
                    label="急需关注" 
                    value={statUrgentMatters} 
                    icon={AlertCircle} 
                    color="bg-amber-500" 
                    onClick={() => setActiveStatModal('urgent')}
                />
                <StatCard 
                    label="已完成" 
                    value={statCompletedMatters} 
                    icon={CheckSquare} 
                    color="bg-emerald-500" 
                    onClick={() => setActiveStatModal('completed')}
                />
                <StatCard 
                    label="已归档" 
                    value={statArchivedMatters} 
                    icon={Archive} 
                    color="bg-slate-500" 
                    onClick={() => setActiveStatModal('archived')}
                />
            </div>

            <div className="space-y-12">
                {/* Section 1: Attention Needed */}
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1.5 h-1.5 bg-amber-500 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.6)]"></div>
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">急需关注</h2>
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{attentionGroups.length}</span>
                    </div>
                    {attentionGroups.length === 0 ? (
                        <div className="text-sm text-slate-400 pl-4 py-6 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 flex items-center gap-2">
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
                            />
                        ))}
                        </div>
                    )}
                </section>

                {/* Section 2: In Progress */}
                <section>
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">正在推进</h2>
                    <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">{inProgressMatters.length}</span>
                </div>
                {inProgressMatters.length === 0 ? (
                    <div className="text-sm text-slate-400 pl-4 py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
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

                {/* Section 3: Completed */}
                {completedActiveMatters.length > 0 && (
                <section>
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">已完成</h2>
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{completedActiveMatters.length}</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {completedActiveMatters.map(m => (
                        <MatterCard 
                        key={m.id} 
                        m={m} 
                        type="completed" 
                        onSelectMatter={onSelectMatter}
                        onDeleteMatter={onDeleteMatter}
                        hasAttention={false}
                        />
                    ))}
                    </div>
                </section>
                )}

                {/* Section 4: Archived */}
                {archivedMatters.length > 0 && (
                    <section className="pt-8 border-t border-slate-200/50">
                        <div className="flex items-center gap-2 mb-4 opacity-70 hover:opacity-100 transition-opacity">
                            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full"></div>
                            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">归档箱</h2>
                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{archivedMatters.length}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                            {archivedMatters.map(m => (
                                <MatterCard 
                                    key={m.id} 
                                    m={m} 
                                    type="archived" 
                                    onSelectMatter={onSelectMatter}
                                    onDeleteMatter={onDeleteMatter}
                                    hasAttention={false}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
      </div>

      <StatDetailModal />
    </div>
  );
};

export default Dashboard;