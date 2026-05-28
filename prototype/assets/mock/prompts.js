/* 全局 Prompt 库 */
window.NX = window.NX || {};
NX.prompts = [
  {
    id: 'p-1', role: '初审', scene: 'SPN',
    mode: 'auto', defaultModel: 'deepseek-local',
    refSchemeCount: 3,
    template:
`你是一个情感分析助手,请基于以下用户反馈做情感分类。

用户反馈:{{用户反馈}}
期望:{{期望}}

请严格按以下 JSON 格式返回:
{
  "thinking": "你的推理过程",
  "情感分类": "你的判定结果(正面/负面/中性)"
}`,
    updatedAt: '2025-05-22',
  },
  {
    id: 'p-2', role: '质检', scene: 'SPN',
    mode: 'auto', defaultModel: 'qwen-local',
    refSchemeCount: 2,
    template:
`你是一个情感分类的质检官,需要更严谨地审核反馈的情感倾向。
注意识别隐性的不满或赞赏。

用户反馈:{{用户反馈}}
期望:{{期望}}

参考错题集:
{{错题集.情感分类·常见误判}}

请严格按以下 JSON 格式返回:
{
  "thinking": "审核思路与依据",
  "情感分类": "复核后的最终判定(正面/负面/中性)"
}`,
    updatedAt: '2025-05-24',
  },
  {
    id: 'p-3', role: '工单分类', scene: 'IPRAN',
    mode: 'auto', defaultModel: 'deepseek-local',
    refSchemeCount: 1,
    template:
`基于以下电信工单内容,判定其属于哪一类故障。

故障描述:{{故障描述}}
设备:{{设备}}
级别:{{级别}}

知识参考:
{{知识库.IPRAN故障分类标准}}

请严格按以下 JSON 格式返回:
{
  "thinking": "判断依据",
  "故障分类": "光路/电路/设备硬件/软件/其他"
}`,
    updatedAt: '2025-05-25',
  },
  {
    id: 'p-4', role: '英文意图(自定义)', scene: '印尼',
    mode: 'custom', defaultModel: 'llama-local',
    refSchemeCount: 0,
    template:
`# 自定义模式:由 UserHooks.init_prompt 拼装
# 使用者可以引入自己的 few-shot 库与变量
Analyze the following customer review and classify sentiment.

Review: <placeholder will be filled by init_prompt>`,
    updatedAt: '2025-05-18',
  },
  {
    id: 'p-5', role: '商品类目', scene: '印尼',
    mode: 'auto', defaultModel: 'qwen-local',
    refSchemeCount: 1,
    template:
`Classify the product category based on the review.

Review: {{Review}}
Product: {{Product}}

Return JSON:
{
  "thinking": "...",
  "Sentiment": "Positive/Negative/Neutral"
}`,
    updatedAt: '2025-05-26',
  },
];
