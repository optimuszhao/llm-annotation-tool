/* 标注工作台:数据行 + 标注结果
   人工答案 / 模型答案均为 是/否 二值。
   TP: 人工=是 & 模型=是
   TN: 人工=否 & 模型=否
   FP: 模型=是 & 人工=否
   FN: 模型=否 & 人工=是
*/
window.NX = window.NX || {};

(function () {
  const YES = '是', NO = '否';

  // [用户反馈, 期望, 人工答案(是=有效/正向, 否=无效/负向)]
  const feedbacks = [
    ['这个商品挺好的,客服也很耐心', '希望下次有更多颜色', YES],
    ['服务态度差,等了好久没人回应',   '退款',               NO],
    ['一般般吧,没啥特色',           '改进体验',           NO],
    ['客服小哥很专业,问题秒解决',     '继续保持',          YES],
    ['物流太慢了,等了半个月',         '加快配送',           NO],
    ['整体还行,价格再低一点就好了',  '降价',               YES],
    ['完全没用,白白浪费时间',        '退款',               NO],
    ['可以,符合预期',               '继续提供',           NO],
    ['真的很不错,推荐购买',          '没有',               YES],
    ['态度让人很无语',               '改进服务',           NO],
    ['好评!客服解答耐心细致',        '保持',               YES],
    ['投诉了几次都没下文',           '正面回应',           NO],
    ['功能蛮齐全的,就是有点贵',     '降价',               YES],
    ['不知道说什么好,反正就是不满意', '改善',              NO],
    ['我已经收到包裹',               '无',                 NO],
  ];

  const rows = [];
  for (let i = 0; i < 80; i++) {
    const [fb, exp, gt] = feedbacks[i % feedbacks.length];
    const id = 'r-' + (1000 + i);

    let status, junshenPred, zhijianPred;
    const mod = i % 12;
    if      (mod < 6)  { status = 'done';    junshenPred = (i % 7 === 0 ? (gt === YES ? NO : YES) : gt); zhijianPred = junshenPred; }
    else if (mod < 8)  { status = 'done';    junshenPred = (gt === YES ? NO : YES); zhijianPred = gt; } // 初审错/质检对
    else if (mod < 9)  { status = 'failed';  junshenPred = null; zhijianPred = null; }
    else if (mod < 10) { status = 'running'; junshenPred = null; zhijianPred = null; }
    else if (mod < 11) { status = 'partial'; junshenPred = gt;   zhijianPred = null; }
    else               { status = 'pending'; junshenPred = null; zhijianPred = null; }

    rows.push({
      id, no: i + 1,
      data: {
        'ID': id,
        '客户ID': 'C-' + (50000 + i * 17),
        '用户反馈': fb,
        '期望': exp,
        '渠道': ['App', 'Web', '电话', '邮件'][i % 4],
        '联系人': '客户' + (i + 1),
        '情感分类': gt,   // GT 列(是/否)
      },
      results: {
        '[初审]_情感分类': junshenPred,
        '[初审]_thinking': junshenPred
          ? `根据用户反馈的语义与情绪信号,判断结论为「${junshenPred}」。`
          : null,
        '[质检]_情感分类': zhijianPred,
        '[质检]_thinking': zhijianPred
          ? `复核初审结论,判定为「${zhijianPred}」,与初审${zhijianPred === junshenPred ? '一致' : '不一致'}。`
          : null,
      },
      status,
      lastTaskAt: status === 'done' ? '2 小时前'
        : status === 'running'      ? '运行中'
        : status === 'failed'       ? '昨天'
        : '-',
    });
  }

  NX.annotationRows = rows;

  /* 单行历史(用于行详情抽屉 → 历史 Tab) */
  NX.rowHistory = {
    'r-1003': [
      {
        taskId: 'tk-ab12', time: '5 分钟前', schemeName: '双角色情感分类',
        roles: [
          { role: '初审', model: 'deepseek-local', elapsedMs: 8200,  parsed: { thinking: '…', 情感分类: YES } },
          { role: '质检', model: 'qwen-local',     elapsedMs: 12300, parsed: { thinking: '…', 情感分类: YES } },
        ],
        gt: YES, verdict: 'both-correct',
      },
      {
        taskId: 'tk-9f0c', time: '2 小时前', schemeName: '单角色快速版',
        roles: [
          { role: '初审', model: 'deepseek-local', elapsedMs: 7100, parsed: { thinking: '…', 情感分类: NO } },
        ],
        gt: YES, verdict: 'wrong',
      },
    ],
  };

  NX.workbenchDefaultCols = ['ID', '用户反馈', '期望', '渠道'];
})();
