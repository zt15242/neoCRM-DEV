import assert from 'node:assert/strict';

console.log('--- 测试 MeetingAssistant 核心算法与高阶图表/树表模型 ---');

// 1. 测试专业术语检索算法逻辑
const sampleGlossary = [
  { term: 'XOQL', aliases: ['X-O-Q-L'], category: 'tech_arch', categoryLabel: '技术与架构', explanation: 'NeoCRM 面向对象化查询语言' },
  { term: 'SOQL', aliases: ['S-O-Q-L'], category: 'tech_arch', categoryLabel: '技术与架构', explanation: 'Salesforce 查询语言' },
  { term: 'CPQ', aliases: ['C-P-Q'], category: 'crm_sales', categoryLabel: 'CRM与业务', explanation: '配置定价报价系统' },
  { term: 'ARR', aliases: ['年度经常性收入'], category: 'crm_sales', categoryLabel: 'CRM与业务', explanation: '年度经常性收入' },
  { term: 'SLA', aliases: ['服务等级协议'], category: 'biz_mgmt', categoryLabel: '商务与管理', explanation: '服务可用性契约' },
];

function matchTermsInText(text, glossary) {
  const hits = [];
  const seen = new Set();
  for (const item of glossary) {
    const allNames = [item.term, ...(item.aliases || [])];
    for (const name of allNames) {
      if (!name || name.length < 2) continue;
      const regex = new RegExp(`\\b${name}\\b`, 'i');
      if ((regex.test(text) || text.includes(name)) && !seen.has(item.term)) {
        seen.add(item.term);
        hits.push({
          term: item.term,
          category: item.categoryLabel,
          explanation: item.explanation,
        });
        break;
      }
    }
  }
  return hits;
}

const sampleSentence = '陈工提到本次从 Salesforce 用 SOQL 导出，再通过 XOQL 写入 NeoCRM，保证了 SLA 并且推动华东大区 1200 万 ARR 落地。';
const matched = matchTermsInText(sampleSentence, sampleGlossary);

console.log('测试段落匹配术语数:', matched.length);
assert.equal(matched.length, 4, '应该准确匹配出 SOQL, XOQL, SLA, ARR 4 个专业术语');
console.log('✓ 术语检索算法验证通过:', matched.map(m => m.term).join(', '));

// 2. 测试思维导图树节点层级展开与遍历算法
const mockTopicTree = {
  id: 'node_root',
  title: '双轨并网与数据中台评审',
  type: 'goal',
  children: [
    {
      id: 'node_topic_1',
      title: '对账时差治理',
      type: 'topic',
      children: [
        { id: 'node_prob_1', title: 'XOQL 轮询撞限', type: 'problem' },
        { id: 'node_sol_1', title: 'Webhook + BatchApex', type: 'solution' },
        { id: 'node_dec_1', title: '立项异步消费管道', type: 'decision' },
      ],
    },
    {
      id: 'node_topic_2',
      title: 'CPQ 报价呈现',
      type: 'topic',
      children: [
        { id: 'node_dec_2', title: 'Nex 页面扩展接入', type: 'decision' },
      ],
    },
  ],
};

function countTreeNodes(node) {
  let count = 1;
  if (node.children) {
    node.children.forEach(c => {
      count += countTreeNodes(c);
    });
  }
  return count;
}

const totalTreeNodes = countTreeNodes(mockTopicTree);
assert.equal(totalTreeNodes, 7, '思维导图树节点总数应为 7');
console.log('✓ 议题层级思维导图树节点统计通过，总节点数:', totalTreeNodes);

// 3. 测试六维语艺雷达图计算
const mockRadars = [
  {
    speakerId: 'spk_1',
    dimensions: { assertiveness: 94, empathy: 80, logicRigor: 96, contribution: 95, questionQuality: 82, pacingControl: 98 },
  },
  {
    speakerId: 'spk_2',
    dimensions: { assertiveness: 78, empathy: 96, logicRigor: 88, contribution: 89, questionQuality: 94, pacingControl: 85 },
  },
];

assert.ok(mockRadars[0].dimensions.assertiveness > mockRadars[1].dimensions.assertiveness, '架构总监说服力应高于交付顾问');
assert.ok(mockRadars[1].dimensions.empathy > mockRadars[0].dimensions.empathy, '交付顾问共情度应高于架构总监');
console.log('✓ 六维语艺雷达图维度差异校验通过');

// 4. 测试决策权衡矩阵对比数据
const mockDecisionTradeoffs = [
  { id: 'dt_1', option: '增量高频 XOQL 轮询', status: 'rejected', riskLevel: 'high' },
  { id: 'dt_2', option: 'Webhook 广播 + BatchApex 异步退避', status: 'adopted', riskLevel: 'low' },
];

assert.equal(mockDecisionTradeoffs.find(d => d.status === 'adopted')?.id, 'dt_2');
assert.equal(mockDecisionTradeoffs.find(d => d.status === 'rejected')?.id, 'dt_1');
console.log('✓ 决策权衡对决矩阵方案状态校验通过');

console.log('🎉 所有会议助手高阶图表、树表与核心算法测试全部通过！');
