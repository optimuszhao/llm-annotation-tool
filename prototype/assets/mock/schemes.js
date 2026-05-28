/* 方案(标注方法)— 引用 Prompt 卡片的组合 */
window.NX = window.NX || {};
NX.schemes = [
  {
    id: 'sc-1', name: '双角色情感分类', scene: 'SPN',
    concurrency: 5,
    promptIds: ['p-1', 'p-2'],
    lastUsed: '5 分钟前',
  },
  {
    id: 'sc-2', name: '单角色快速版', scene: 'SPN',
    concurrency: 8,
    promptIds: ['p-1'],
    lastUsed: '2 小时前',
  },
  {
    id: 'sc-3', name: 'IPRAN 工单分类', scene: 'IPRAN',
    concurrency: 5,
    promptIds: ['p-3'],
    lastUsed: '昨天',
  },
  {
    id: 'sc-4', name: '印尼语料综合', scene: '印尼',
    concurrency: 5,
    promptIds: ['p-5', 'p-4'],
    lastUsed: '1 周前',
  },
];
