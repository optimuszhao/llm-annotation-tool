/* 标注任务历史 */
window.NX = window.NX || {};
NX.tasks = [
  {
    id: 'tk-ab12', triggeredAt: '5 分钟前',
    datasetId: 'ds-1', datasetName: '客户反馈_2025Q1.xlsx',
    schemeId: 'sc-1', schemeName: '双角色情感分类',
    rowCount: 50, progress: { done: 38, total: 50 },
    status: 'running',
  },
  {
    id: 'tk-9f0c', triggeredAt: '2 小时前',
    datasetId: 'ds-1', datasetName: '客户反馈_2025Q1.xlsx',
    schemeId: 'sc-2', schemeName: '单角色快速版',
    rowCount: 200, progress: { done: 200, total: 200 },
    status: 'done',
    accuracy: 0.823,
  },
  {
    id: 'tk-4521', triggeredAt: '昨天 10:30',
    datasetId: 'ds-2', datasetName: '电信工单_IPRAN.xlsx',
    schemeId: 'sc-3', schemeName: 'IPRAN 工单分类',
    rowCount: 100, progress: { done: 97, total: 100 },
    status: 'failed', errMsg: '3 行解析失败',
    accuracy: 0.74,
  },
  {
    id: 'tk-77e3', triggeredAt: '3 天前',
    datasetId: 'ds-4', datasetName: 'Indo_Reviews_May.xlsx',
    schemeId: 'sc-4', schemeName: '印尼语料综合',
    rowCount: 80, progress: { done: 22, total: 80 },
    status: 'cancelled',
  },
];
