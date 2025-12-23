import React from 'react';
import { TaskStatus } from '../types';

interface Props {
  status: TaskStatus;
  customText?: string;
  className?: string;
}

const CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; border: string }> = {
  [TaskStatus.PENDING]: { label: '待办', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' },
  [TaskStatus.IN_PROGRESS]: { label: '进行中', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  [TaskStatus.COMPLETED]: { label: '已完成', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  [TaskStatus.BLOCKED]: { label: '受阻/等待', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  [TaskStatus.SKIPPED]: { label: '不适用', bg: 'bg-gray-50', text: 'text-gray-400', border: 'border-gray-200' },
  [TaskStatus.EXCEPTION]: { label: '例外处理', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  [TaskStatus.OTHER]: { label: '其他', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
};

const StatusBadge: React.FC<Props> = ({ status, customText, className = '' }) => {
  const config = CONFIG[status] || CONFIG[TaskStatus.PENDING];
  const label = (status === TaskStatus.OTHER && customText) ? customText : config.label;
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.text} ${config.border} ${className}`}>
      {label}
    </span>
  );
};

export default StatusBadge;
