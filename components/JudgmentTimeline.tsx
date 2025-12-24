import React, { useState, useEffect, useRef } from 'react';
import { Matter, TaskStatus, JudgmentRecord, AIAnalysisResult } from '../types';
import { Send, Clock, GitCommit, AlertCircle, CheckCircle2, PlayCircle, PauseCircle, HelpCircle, Sparkles, ChevronDown, ChevronUp, Copy, History, Tag, RefreshCw, X } from 'lucide-react';
import { analyzeJudgmentTimeline } from '../services/aiAnalysisService';

interface Props {
  matter: Matter;
  allMatters: Matter[]; // Needed for historical comparison
  onUpdate: (updatedMatter: Matter) => void;
}

const JudgmentTimeline: React.FC<Props> = ({ matter, allMatters, onUpdate }) => {
  const [content, setContent] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<TaskStatus | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // AI State
  // Read analysis from the matter itself for persistence
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(!!matter.latestAnalysis);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Ensure panel opens when new analysis arrives
  useEffect(() => {
      if (matter.latestAnalysis) {
          setIsAiPanelOpen(true);
      }
  }, [matter.latestAnalysis?.timestamp]);

  // Status config for selection
  const statusOptions = [
    { value: TaskStatus.IN_PROGRESS, label: '正常推进', icon: PlayCircle, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { value: TaskStatus.BLOCKED, label: '受阻/等待', icon: PauseCircle, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    { value: TaskStatus.EXCEPTION, label: '例外情况', icon: AlertCircle, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    { value: TaskStatus.SKIPPED, label: '不适用', icon: HelpCircle, color: 'text-gray-500 bg-gray-50 border-gray-200' },
    { value: TaskStatus.COMPLETED, label: '已完成', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  ];

  const handleSubmit = () => {
    if (!content.trim()) return;

    const newRecord: JudgmentRecord = {
      id: Math.random().toString(36).substr(2, 9),
      content: content.trim(),
      status: selectedStatus || undefined,
      timestamp: Date.now()
    };

    const newTimeline = [newRecord, ...(matter.judgmentTimeline || [])];

    const updates: Partial<Matter> = {
      judgmentTimeline: newTimeline,
      lastUpdated: Date.now(),
      currentSituation: newRecord.content,
    };

    if (selectedStatus) {
      updates.overallStatus = selectedStatus;
    }

    onUpdate({ ...matter, ...updates });
    setContent('');
    setSelectedStatus(null);
  };

  const handleRunAnalysis = async () => {
    if (matter.judgmentTimeline.length === 0) {
      alert("请先添加至少一条判断记录");
      return;
    }
    
    setIsAiPanelOpen(true);
    setIsAnalyzing(true);
    
    const result = await analyzeJudgmentTimeline(matter, allMatters);
    
    if (result) {
        onUpdate({ 
            ...matter, 
            latestAnalysis: { ...result, timestamp: Date.now() },
            lastUpdated: Date.now()
        });
    }
    
    setIsAnalyzing(false);
  };

  const getStatusBadge = (status?: TaskStatus) => {
    if (!status) return null;
    const opt = statusOptions.find(o => o.value === status) || { label: '其他', color: 'text-slate-600 bg-slate-50 border-slate-200' };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${opt.color} font-medium inline-flex items-center gap-1`}>
        {opt.label}
      </span>
    );
  };

  const formatDate = (ts: number) => {
      return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  // --- AI Analysis Content Component (Shared) ---
  const AnalysisContent = () => (
      <div className="space-y-5 text-sm">
        {isAnalyzing ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-3">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                <span className="text-xs">正在整理历史记录并进行对照...</span>
            </div>
        ) : matter.latestAnalysis ? (
            <>
                {/* 1. Summary */}
                <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">当前判断摘要</h4>
                    <p className="text-slate-700 dark:text-slate-200 leading-relaxed text-sm bg-slate-50 dark:bg-slate-700/30 p-3 rounded border border-slate-100 dark:border-slate-700/50">
                        {matter.latestAnalysis.summary}
                    </p>
                </div>

                {/* 2. Evolution */}
                <div className="space-y-1">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <History size={12}/> 判断演变
                    </h4>
                    <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                        {matter.latestAnalysis.evolution}
                    </p>
                </div>

                {/* 3. Blockers */}
                {matter.latestAnalysis.blockerTags.length > 0 && (
                    <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Tag size={12}/> 高频卡点
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {matter.latestAnalysis.blockerTags.map((tag, i) => (
                                <span key={i} className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-800">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* 4. Similar Cases */}
                <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                        <Copy size={12}/> 历史相似事项
                    </h4>
                    {matter.latestAnalysis.similarCases.length === 0 ? (
                        <div className="text-xs text-slate-400 italic">未发现具有高度相似判断模式的历史事项。</div>
                    ) : (
                        <div className="grid gap-2">
                            {matter.latestAnalysis.similarCases.map((sim, i) => (
                                <div key={i} className="bg-slate-50 dark:bg-slate-700/30 rounded border border-slate-100 dark:border-slate-700 p-2">
                                    <div className="font-bold text-slate-700 dark:text-slate-200 text-xs mb-1">{sim.matterName}</div>
                                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">{sim.similarity}</div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-white dark:bg-slate-800 p-1.5 rounded border border-slate-100 dark:border-slate-600">
                                        事实参考：{sim.facts}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 text-[10px] text-slate-400 text-center">
                    AI 辅助分析，仅供参考，不构成判断结论。请基于实际情况决策。
                </div>
            </>
        ) : (
            <div className="text-xs text-red-400 text-center">分析服务暂时不可用，请检查网络或配置。</div>
        )}
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-50/50 dark:bg-slate-900/50 relative">
      
      {/* Header */}
      <div className="p-6 pb-2 shrink-0 flex items-start justify-between">
        <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <GitCommit className="text-blue-600 dark:text-blue-400" />
            判断时间线
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            记录对当前事项的专业判断与推进情况。此处记录将作为事项的最新状态。
            </p>
        </div>
        
        {/* Trigger Button - Always visible if analysis exists or not */}
        <button 
            onClick={handleRunAnalysis}
            disabled={isAnalyzing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm ${
                matter.latestAnalysis 
                ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
            }`}
        >
            <Sparkles size={14} className={isAnalyzing ? 'animate-pulse' : ''} />
            {isAnalyzing ? '分析中...' : matter.latestAnalysis ? '重新分析' : 'AI 辅助分析'}
        </button>
      </div>

      {/* 
          Desktop: Inline Expandable Panel (Visible on md+) 
      */}
      <div className={`hidden md:block mx-6 mt-2 transition-all duration-500 ease-in-out overflow-hidden ${isAiPanelOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
         <div className="bg-white dark:bg-slate-800 rounded-xl border border-indigo-100 dark:border-indigo-900 shadow-sm overflow-hidden">
             <div 
                className="bg-indigo-50/50 dark:bg-indigo-900/20 px-4 py-2 flex items-center justify-between cursor-pointer border-b border-indigo-100 dark:border-indigo-900/50"
                onClick={() => setIsAiPanelOpen(!isAiPanelOpen)}
             >
                 <div className="flex items-center gap-2">
                     <span className="text-xs font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
                        <Sparkles size={12} /> 智能归纳与对照
                     </span>
                     {matter.latestAnalysis?.timestamp && (
                         <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                             更新于: {new Date(matter.latestAnalysis.timestamp).toLocaleTimeString()}
                         </span>
                     )}
                 </div>
                 <ChevronUp size={14} className="text-indigo-400"/>
             </div>
             <div className="p-4">
                <AnalysisContent />
             </div>
         </div>
      </div>

      {/* 
          Mobile: Bottom Sheet Modal (Visible only when open and on small screens)
          Uses fixed positioning to overlay on top of content.
      */}
      <div className={`md:hidden fixed inset-0 z-50 transition-all duration-300 ${isAiPanelOpen ? 'visible' : 'invisible pointer-events-none'}`}>
          {/* Backdrop */}
          <div 
            className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isAiPanelOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setIsAiPanelOpen(false)}
          ></div>
          
          {/* Sheet */}
          <div className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ${isAiPanelOpen ? 'translate-y-0' : 'translate-y-full'}`}>
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-indigo-500" />
                      <span className="font-bold text-slate-800 dark:text-white">智能归纳与对照</span>
                  </div>
                  <button onClick={() => setIsAiPanelOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full bg-slate-100 dark:bg-slate-800">
                      <X size={18} />
                  </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                  <AnalysisContent />
              </div>
          </div>
      </div>

      {/* Input Area */}
      <div className="p-6 pt-4 shrink-0">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 transition-all focus-within:ring-2 focus-within:ring-blue-100 dark:focus-within:ring-blue-900/30">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="当前推进情况如何？是否存在卡点？基于什么做出了判断？..."
            className="w-full text-sm bg-transparent border-none outline-none resize-none placeholder-slate-400 text-slate-700 dark:text-slate-200 min-h-[80px]"
            onKeyDown={(e) => { if(e.ctrlKey && e.key === 'Enter') handleSubmit(); }}
          />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
            {/* Status Selector */}
            <div className="flex flex-wrap gap-2">
              {statusOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedStatus(selectedStatus === opt.value ? null : opt.value)}
                  className={`
                    text-[10px] px-2 py-1 rounded-full border transition-all flex items-center gap-1
                    ${selectedStatus === opt.value 
                      ? opt.color + ' ring-1 ring-offset-1 dark:ring-offset-slate-800' 
                      : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}
                  `}
                >
                  <opt.icon size={12} /> {opt.label}
                </button>
              ))}
            </div>

            <button 
              onClick={handleSubmit}
              disabled={!content.trim()}
              className="self-end md:self-auto px-4 py-1.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold rounded-lg hover:bg-slate-700 dark:hover:bg-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send size={12} /> 提交判断
            </button>
          </div>
        </div>
      </div>

      {/* Timeline List */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 relative" ref={scrollRef}>
        {!matter.judgmentTimeline || matter.judgmentTimeline.length === 0 ? (
          <div className="text-center py-12 opacity-50">
             <div className="w-12 h-12 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                <GitCommit size={24} className="text-slate-400" />
             </div>
             <p className="text-sm text-slate-500">暂无判断记录</p>
             <p className="text-xs text-slate-400 mt-1">添加第一条记录以明确当前事项状态</p>
          </div>
        ) : (
          <div className="space-y-0 pl-4 border-l-2 border-slate-200 dark:border-slate-700 ml-3 py-2">
            {matter.judgmentTimeline.map((record, index) => (
              <div key={record.id} className="relative pl-6 pb-8 last:pb-0 group">
                {/* Timeline Node */}
                <div className={`
                    absolute left-[-9px] top-0 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-sm
                    ${index === 0 ? 'bg-blue-500 ring-4 ring-blue-100 dark:ring-blue-900/30' : 'bg-slate-300 dark:bg-slate-600'}
                `}></div>
                
                {/* Content Card */}
                <div className={`
                    rounded-lg border p-4 transition-all
                    ${index === 0 
                        ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-800 shadow-md' 
                        : 'bg-white/60 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700 grayscale hover:grayscale-0'}
                `}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            {getStatusBadge(record.status)}
                            {index === 0 && (
                                <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 px-1.5 rounded">Current</span>
                            )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                            <Clock size={10} /> {formatDate(record.timestamp)}
                        </span>
                    </div>
                    
                    <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {record.content}
                    </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default JudgmentTimeline;