/* 标注工作台:数据行 + 标注结果
   仅生成当前演示用的 80 行数据(覆盖各种状态)。
   真实场景下后端分页 + 虚拟滚动。
*/
window.NX = window.NX || {};

(function () {
  const POS = '正面', NEG = '负面', NEU = '中性';

  const feedbacks = [
    ['这个商品挺好的,客服也很耐心', '希望下次有更多颜色', POS],
    ['服务态度差,等了好久没人回应',   '退款',                NEG],
    ['一般般吧,没啥特色',           '改进体验',          NEU],
    ['客服小哥很专业,问题秒解决',     '继续保持',         POS],
    ['物流太慢了,等了半个月',         '加快配送',          NEG],
    ['整体还行,价格再低一点就好了',  '降价',              POS],
    ['完全没用,白白浪费时间',        '退款',              NEG],
    ['可以,符合预期',               '继续提供',          NEU],
    ['真的很不错,推荐购买',          '没有',              POS],
    ['态度让人很无语',               '改进服务',          NEG],
    ['好评!客服解答耐心细致',        '保持',              POS],
    ['投诉了几次都没下文',           '正面回应',          NEG],
    ['功能蛮齐全的,就是有点贵',     '降价',              POS],
    ['不知道说什么好,反正就是不满意', '改善',             NEG],
    ['我已经收到包裹',               '无',                NEU],
  ];

  const rows = [];
  for (let i = 0; i < 80; i++) {
    const [fb, exp, gt] = feedbacks[i % feedbacks.length];
    const id = 'r-' + (1000 + i);
    // 制造各种状态混合
    let status, junshenPred, zhijianPred;
    const mod = i % 12;
    if      (mod < 6) { status = 'done';    junshenPred = (i % 7 === 0 ? (gt === POS ? NEG : POS) : gt); zhijianPred = junshenPred; }
    else if (mod < 8) { status = 'done';    junshenPred = (gt === POS ? NEG : POS); zhijianPred = gt; } /* 不一致 */
    else if (mod < 9) { status = 'failed';  junshenPred = null; zhijianPred = null; }
    else if (mod < 10){ status = 'running'; junshenPred = null; zhijianPred = null; }
    else if (mod < 11){ status = 'partial'; junshenPred = gt;   zhijianPred = null; }
    else              { status = 'pending'; junshenPred = null; zhijianPred = null; }

    rows.push({
      id, no: i + 1,
      data: {
        'ID': id,
        '客户ID': 'C-' + (50000 + i * 17),
        '用户反馈': fb,
        '期望': exp,
        '渠道': ['App', 'Web', '电话', '邮件'][i % 4],
        '联系人': '客户' + (i + 1),
        '情感分类': gt,        // GT
        '预测情感': junshenPred || '-',  // 预测列(可与 [初审]_情感分类 联动)
      },
      results: {
        '[初审]_情感分类':  junshenPred,
        '[初审]_thinking':  junshenPred ? `用户反馈表达${junshenPred === POS ? '正向' : junshenPred === NEG ? '负向' : '中性'},基于关键词与语气判断。` : null,
        '[质检]_情感分类':  zhijianPred,
        '[质检]_thinking':  zhijianPred ? `复核认定情感为${zhijianPred},与初审${zhijianPred === junshenPred ? '一致' : '不一致'}。` : null,
      },
      status,
      lastTaskAt: status === 'done' ? '2 小时前' : status === 'running' ? '运行中' : status === 'failed' ? '昨天' : '-',
    });
  }

  NX.annotationRows = rows;

  /* 该数据集下所有跑过该方案的任务摘要(用于单行历史) */
  NX.rowHistory = {
    'r-1003': [
      {
        taskId: 'tk-ab12', time: '5 分钟前', schemeName: '双角色情感分类',
        roles: [
          { role: '初审', model: 'deepseek-local', elapsedMs: 8200, parsed: { thinking: '...', '情感分类': '正面' } },
          { role: '质检', model: 'qwen-local',     elapsedMs: 12300, parsed: { thinking: '...', '情感分类': '正面' } },
        ],
        gt: '正面', verdict: 'both-correct',
      },
      {
        taskId: 'tk-9f0c', time: '2 小时前', schemeName: '单角色快速版',
        roles: [
          { role: '初审', model: 'deepseek-local', elapsedMs: 7100, parsed: { thinking: '...', '情感分类': '负面' } },
        ],
        gt: '正面', verdict: 'wrong',
      },
    ],
  };

  /* 默认列规划(供工作台默认显示) */
  NX.workbenchDefaultCols = ['ID', '用户反馈', '期望', '渠道'];
})();
