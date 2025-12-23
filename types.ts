
export enum TaskStatus {
  PENDING = 'PENDING',       // 待处理
  IN_PROGRESS = 'IN_PROGRESS', // 进行中
  COMPLETED = 'COMPLETED',   // 已完成
  BLOCKED = 'BLOCKED',       // 受阻 (Wait for external/internal)
  SKIPPED = 'SKIPPED',       // 不适用 (N/A)
  EXCEPTION = 'EXCEPTION',   // 例外处理 (Procedural deviation)
  OTHER = 'OTHER'            // 其他 (Custom)
}

export interface Material {
  id: string;
  name: string;
  category?: 'REFERENCE' | 'DELIVERABLE'; // REFERENCE: Template files; DELIVERABLE: Work outputs
  isReady: boolean;
  note?: string;
  // File metadata
  fileId?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
}

export interface StatusUpdate {
  id: string;
  content: string;
  timestamp: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string; // Additional context
  dueDate?: number; // New: Deadline for specific task
  status: TaskStatus;
  customStatus?: string; // For OTHER status
  statusNote: string; // Legacy field, kept for backward compatibility
  statusUpdates?: StatusUpdate[]; // New field for multiple records
  materials: Material[];
  lastUpdated: number;
}

export interface Stage {
  id: string;
  title: string;
  dueDate?: number; // New: Deadline for specific stage
  tasks: Task[];
}

export interface Matter {
  id: string;
  title: string;
  type: string; // e.g., "SPV Deregistration"
  dueDate?: number; // Optional due date for sorting
  createdAt: number;
  lastUpdated: number;
  stages: Stage[];
  archived: boolean;
  dismissedAttentionIds?: string[]; // IDs of tasks or 'OVERDUE' to ignore in attention dashboard
}

export interface Template {
  id: string;
  name: string;
  description: string;
  stages: Stage[];
}