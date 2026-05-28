/* 知识库片段 */
window.NX = window.NX || {};
NX.knowledge = [
  {
    id: 'kb-1', name: 'IPRAN故障分类标准', scene: 'IPRAN', tags: ['标准', '分类'],
    content: '光路类:光纤断裂、光路中断、光衰过大;\n电路类:电压异常、电源故障;\n设备硬件:板卡故障、风扇异常;\n软件:版本回退失败、配置丢失;\n其他:需进一步定位的非典型问题。',
    updatedAt: '2025-04-10',
  },
  {
    id: 'kb-2', name: '情感分类边界用例', scene: 'SPN', tags: ['情感', 'few-shot'],
    content: '【正面但带建议】"整体不错,但希望能改善售后" → 正面\n【负面但客气】"谢谢您的协助,不过我对这次的服务并不满意" → 负面\n【中性陈述】"我已经收到包裹" → 中性',
    updatedAt: '2025-05-12',
  },
  {
    id: 'kb-3', name: '客服话术参考', scene: 'SPN', tags: ['话术'],
    content: '一线客服常用表达模板,可用于识别"专业表达 = 客服而非客户"的情形。',
    updatedAt: '2025-05-15',
  },
  {
    id: 'kb-4', name: 'Thai customer phrases', scene: '泰国', tags: ['localization'],
    content: 'ขอบคุณ (thanks) usually neutral.\nไม่ดี (not good) → negative.\nดีมาก (very good) → positive.',
    updatedAt: '2025-05-20',
  },
];
