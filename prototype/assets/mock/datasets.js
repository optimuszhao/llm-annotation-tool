/* 数据集列表 */
window.NX = window.NX || {};
NX.datasets = [
  {
    id: 'ds-1', name: '客户反馈_2025Q1.xlsx', scene: 'SPN',
    rowCount: 1234, colCount: 8, mappingDone: true,
    createdAt: '2025-04-12',
    columns: ['ID', '客户ID', '用户反馈', '期望', '渠道', '联系人', '情感分类', '预测情感'],
    mapping: {
      defaultCols: ['ID', '用户反馈', '期望'],
      refCols:     ['用户反馈', '期望', '渠道'],
      gtCol:       '情感分类',
      predCol:     '预测情感',
    },
  },
  {
    id: 'ds-2', name: '电信工单_IPRAN.xlsx', scene: 'IPRAN',
    rowCount: 658, colCount: 11, mappingDone: true,
    createdAt: '2025-04-30',
    columns: ['工单号', '故障描述', '设备', '级别', '处理结果', '处理人', '故障分类', '是否复现', '历史方案', '工单状态', 'AI 分类'],
    mapping: {
      defaultCols: ['工单号', '故障描述', '设备'],
      refCols:     ['故障描述', '设备', '级别'],
      gtCol:       '故障分类',
      predCol:     'AI 分类',
    },
  },
  {
    id: 'ds-3', name: 'Thai_Customer_Survey.xlsx', scene: '泰国',
    rowCount: 423, colCount: 6, mappingDone: false,
    createdAt: '2025-05-08',
    columns: ['ID', 'Comment', 'Channel', 'Score', 'Category', 'Predicted'],
    mapping: null,
  },
  {
    id: 'ds-4', name: 'Indo_Reviews_May.xlsx', scene: '印尼',
    rowCount: 1820, colCount: 7, mappingDone: true,
    createdAt: '2025-05-15',
    columns: ['ID', 'Review', 'Rating', 'Product', 'Source', 'Sentiment', 'PredSentiment'],
    mapping: {
      defaultCols: ['ID', 'Review', 'Rating'],
      refCols:     ['Review', 'Rating', 'Product'],
      gtCol:       'Sentiment',
      predCol:     'PredSentiment',
    },
  },
  {
    id: 'ds-5', name: '合并_客户语料_v2', scene: 'SPN', merged: true,
    rowCount: 2095, colCount: 9, mappingDone: true,
    createdAt: '2025-05-20', parentIds: ['ds-1', 'ds-2'],
    columns: ['ID', '原始来源', '用户反馈', '期望', '渠道', '设备', '故障描述', '情感分类', '预测情感'],
    mapping: {
      defaultCols: ['ID', '用户反馈', '期望'],
      refCols:     ['用户反馈', '期望', '设备'],
      gtCol:       '情感分类',
      predCol:     '预测情感',
    },
  },
];
