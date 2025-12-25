import { Matter, AIAnalysisResult, AIWorkStatusResult, TaskStatus, Template } from "../types";

const SETTINGS_KEY = 'opus_settings_v1';
const DEFAULT_API_HOST = "https://api.chatanywhere.tech";

// Helper to get settings
const getSettings = () => {
    let apiKey = process.env.API_KEY;
    let apiHost = DEFAULT_API_HOST;
    try {
        const settingsStr = localStorage.getItem(SETTINGS_KEY);
        if (settingsStr) {
            const settings = JSON.parse(settingsStr);
            if (settings.apiKey) apiKey = settings.apiKey;
            if (settings.apiHost) apiHost = settings.apiHost;
        }
    } catch (e) {
        console.warn("Failed to read settings", e);
    }
    return { apiKey, apiHost };
};

// Helper to sanitize data: Remove tasks, stages, files. Only keep Judgment Timeline.
const extractTimelineData = (matter: Matter) => {
  return {
    id: matter.id,
    title: matter.title,
    timeline: matter.judgmentTimeline.map(r => ({
      date: new Date(r.timestamp).toISOString().split('T')[0],
      status: r.status,
      content: r.content
    }))
  };
};

export const analyzeJudgmentTimeline = async (
  currentMatter: Matter, 
  allMatters: Matter[]
): Promise<AIAnalysisResult | null> => {
  
  const { apiKey, apiHost } = getSettings();

  if (!apiKey) {
    alert("请在设置中配置 API Key 以使用 AI 分析功能。");
    return null;
  }

  // 2. Prepare Data
  const historyMatters = allMatters
    .filter(m => m.id !== currentMatter.id && m.judgmentTimeline && m.judgmentTimeline.length > 0)
    .map(extractTimelineData);

  const currentData = extractTimelineData(currentMatter);

  // 3. Construct Prompt
  const systemPrompt = `
    你是一个客观的法务运营分析助手。你的任务是对用户提供的【当前事项判断时间线】及【历史事项判断时间线】进行归纳与对照分析。
    
    你需要严格遵守以下原则：
    1. 仅分析已有的判断记录，**绝不生成新的判断结论，绝不提供行动建议**。
    2. 严格基于事实数据，保持客观、中立。
    3. 输出必须为标准的 JSON 格式，不要包含 Markdown 代码块标记。

    你的输出需要包含以下四个字段：
    
    1. **summary** (string): 当前判断摘要。基于当前事项的记录，用 3-5 行文字概括整体推进态势、主要卡点（如有）及是否可控。
    2. **evolution** (string): 判断演变概览。简述“判断状态”和“关键描述”是如何随着时间演变到当前状态的。
    3. **blockerTags** (string array): 高频卡点归纳。输出 1-3 个短语标签（例如：“外部决策等待”、“内部审批节奏”），仅做分类。
    4. **similarCases** (array): 相似事项对照。在历史事项中查找判断模式相似的事项（若无相似则返回空数组）。每个对象包含：
       - "matterName": 事项名称
       - "similarity": 1-2句话说明相似点（如：都在同一阶段受阻）
       - "facts": 事实型信息（如：当时平均等待时长、最终结果），不包含建议。

    输入数据格式：
    {
      "current": { title, timeline: [{date, status, content}] },
      "history": [ { title, timeline: [...] } ]
    }
  `;

  const userPayload = {
    current: currentData,
    history: historyMatters
  };

  try {
    const cleanHost = apiHost.endsWith('/') ? apiHost.slice(0, -1) : apiHost;
    const response = await fetch(`${cleanHost}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ],
        temperature: 0.3
      })
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson) as AIAnalysisResult;

  } catch (error) {
    console.error("AI Analysis Failed:", error);
    alert("AI 分析失败，请检查 API Key 或网络连接。");
    return null;
  }
};

export const analyzeWorkStatus = async (matters: Matter[]): Promise<AIWorkStatusResult | null> => {
    const { apiKey, apiHost } = getSettings();
    if (!apiKey) {
        alert("请先在设置中配置 API Key 以使用工作态势速览功能。");
        return null;
    }

    // Filter Input: Only Active Matters, stripped to essentials
    const activeMatters = matters.filter(m => !m.archived).map(m => {
        // Find latest judgment
        const latestJ = m.judgmentTimeline.length > 0 ? m.judgmentTimeline[0] : null;
        
        return {
            id: m.id,
            title: m.title,
            currentStatus: m.overallStatus || TaskStatus.PENDING, // Use overall status derived from judgments
            lastJudgmentContent: latestJ?.content || "暂无判断记录",
            lastJudgmentTime: latestJ ? new Date(latestJ.timestamp).toISOString().split('T')[0] : "无",
            lastUpdatedTime: new Date(m.lastUpdated).toISOString().split('T')[0]
        };
    });

    if (activeMatters.length === 0) return null;

    const systemPrompt = `
      你是一个法务运营工作台的态势感知 AI。你的任务是根据所有进行中事项的状态和判断记录，生成一份【工作态势速览】。

      ### 必须遵守的原则
      1. **仅描述事实与态势**：归纳“现在是什么情况”，绝不提供“应该怎么做”的建议。
      2. **不越界**：不排序优先级，不评价单个事项的好坏。
      3. **客观语言**：禁止使用“建议、应该、需要、尽快”等祈使或建议性词汇。
      4. **输出格式**：纯 JSON，无 Markdown 标记。

      ### 输出字段要求
      1. **overview** (string): 整体工作态势概览。用一句话描述分布（如：X个进行中，Y个受阻，Z个完成）。
      2. **blockerTypes** (array): 主要受阻类型归纳。分析状态为 BLOCKED 或包含受阻描述的事项，归纳出 1-3 个卡点类型标签。
         格式: [{ "tag": "外部审批等待", "count": 2 }]
      3. **updateRhythm** (string): 判断更新节奏提示。基于 lastJudgmentTime，客观指出是否存在长时间（如超过7天）未更新判断的事项。若无则提示节奏稳定。
      4. **workload** (string): (可选) 工作负荷感知。基于受阻数量和更新频率的直观描述（如“受阻事项较多，需关注推进难度”），保持中性。

      ### 输入数据示例
      [ { title, currentStatus, lastJudgmentContent, lastJudgmentTime } ... ]
    `;

    try {
        const cleanHost = apiHost.endsWith('/') ? apiHost.slice(0, -1) : apiHost;
        const response = await fetch(`${cleanHost}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: JSON.stringify(activeMatters) }
                ],
                temperature: 0.3
            })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return null;

        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanJson);
        
        return {
            ...result,
            timestamp: Date.now()
        } as AIWorkStatusResult;

    } catch (error) {
        console.error("Dashboard AI Analysis Failed:", error);
        alert("AI 分析失败 (Error " + error + ")。请检查 API Key 配置或网络。");
        return null;
    }
};

export const generateTemplateFromText = async (text: string): Promise<Template | null> => {
    const { apiKey, apiHost } = getSettings();
    if (!apiKey) {
        alert("请先配置 API Key。");
        return null;
    }

    const systemPrompt = `
      你是一个流程专家。用户的输入是一段工作说明、总结或流程描述。
      你需要根据这段文本，提取并生成一个结构化的工作模板。
      
      输出必须是符合以下 TypeScript 接口的 JSON 数据（不要 Markdown）：
      
      interface Template {
        name: string; // 模板名称，简短有力
        description: string; // 适用场景说明
        stages: {
          id: string; // 使用随机字符串，如 "s1"
          title: string; // 阶段名称
          tasks: {
             id: string; // 使用随机字符串，如 "t1"
             title: string; // 任务名称
             description?: string; // 任务描述或指引
             status: "PENDING";
             statusNote: "";
             lastUpdated: number; // 当前时间戳
             materials: { // 如果文本中提到了需要的文件或产物
                id: string;
                name: string;
                isReady: false;
                category: "DELIVERABLE"; // 默认为产物
             }[];
          }[];
        }[];
      }
      
      注意：
      1. 自动推断合理的阶段划分。
      2. 任务名要具体。
      3. status 固定为 "PENDING"。
      4. 如果提到具体文件，加入 materials。
    `;

    try {
        const cleanHost = apiHost.endsWith('/') ? apiHost.slice(0, -1) : apiHost;
        const response = await fetch(`${cleanHost}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: text }
                ],
                temperature: 0.5
            })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (!content) return null;

        const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson) as Template;

    } catch (e) {
        console.error("Template Generation Failed:", e);
        alert("模板生成失败");
        return null;
    }
};
