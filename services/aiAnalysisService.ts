import { Matter, AIAnalysisResult, JudgmentRecord } from "../types";

const API_HOST = "https://api.chatanywhere.tech";

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
  
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API Key missing");
    return null;
  }

  // 1. Prepare Data
  // Exclude current matter from history to avoid self-comparison
  const historyMatters = allMatters
    .filter(m => m.id !== currentMatter.id && m.judgmentTimeline && m.judgmentTimeline.length > 0)
    .map(extractTimelineData);

  const currentData = extractTimelineData(currentMatter);

  // 2. Construct Prompt
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
    const response = await fetch(`${API_HOST}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo", // Using a standard, fast model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ],
        temperature: 0.3, // Low temperature for factual consistency
        // response_format: { type: "json_object" } // Force JSON if model supports it (gpt-3.5-turbo-1106+)
      })
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) return null;

    // Remove markdown code blocks if present (some models still add them despite prompt)
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    return JSON.parse(cleanJson) as AIAnalysisResult;

  } catch (error) {
    console.error("AI Analysis Failed:", error);
    return null;
  }
};
