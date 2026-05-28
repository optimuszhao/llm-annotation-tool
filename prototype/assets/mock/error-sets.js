/* 错题与错题集 */
window.NX = window.NX || {};

/* 单条错题(每条 = 标注工作台勾选行 × 选定列保存来的 JSON) */
NX.errorEntries = [
  {
    id: 'err-1', scene: 'SPN', setId: 'es-1',
    sourceRowId: 'r-882', createdAt: '2025-05-25 10:42',
    content: {
      '用户反馈': '这个商品我等了一周才到货,但客服态度真的很耐心。',
      '期望': '希望下次能更快配送',
      'GT': '正面',
      '[初审]_情感分类': '负面',
    },
  },
  {
    id: 'err-2', scene: 'SPN', setId: 'es-1',
    sourceRowId: 'r-861', createdAt: '2025-05-25 10:42',
    content: {
      '用户反馈': '说实话有点失望,功能没什么亮点。',
      '期望': '产品改进',
      'GT': '负面',
      '[初审]_情感分类': '中性',
    },
  },
  {
    id: 'err-3', scene: 'SPN', setId: 'es-1',
    sourceRowId: 'r-803', createdAt: '2025-05-24 16:10',
    content: {
      '用户反馈': '功能蛮齐全的,就是有点贵。',
      'GT': '正面',
      '[初审]_情感分类': '负面',
    },
  },
  {
    id: 'err-4', scene: 'IPRAN', setId: 'es-2',
    sourceRowId: 'r-2110', createdAt: '2025-05-22 14:00',
    content: {
      '故障描述': '光衰从 -18dBm 持续掉到 -27dBm,持续 30 分钟',
      'GT': '光路',
      '[工单分类]_故障分类': '设备硬件',
    },
  },
  /* 散错题(尚未归集,setId 为 null) */
  {
    id: 'err-5', scene: 'SPN', setId: null,
    sourceRowId: 'r-1031', createdAt: '2025-05-26 09:15',
    content: {
      '用户反馈': '客服真的很尽力,但问题还是没解决',
      'GT': '负面',
      '[初审]_情感分类': '正面',
    },
  },
  {
    id: 'err-6', scene: 'SPN', setId: null,
    sourceRowId: 'r-1058', createdAt: '2025-05-26 11:32',
    content: {
      '用户反馈': '我不太懂,这是要我自己重启吗',
      'GT': '中性',
      '[初审]_情感分类': '负面',
    },
  },
];

/* 命名错题集 */
NX.errorSets = [
  {
    id: 'es-1', name: '情感分类·常见误判', scene: 'SPN',
    description: '"正话反说"类边界用例,初审角色经常误判',
    createdAt: '2025-05-25',
    entryCount: 23,
  },
  {
    id: 'es-2', name: 'IPRAN 工单·光路 vs 设备硬件', scene: 'IPRAN',
    description: '边界用例:光衰与设备故障常被混淆',
    createdAt: '2025-05-22',
    entryCount: 8,
  },
];
