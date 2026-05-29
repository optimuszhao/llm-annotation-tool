export function renderStartPage() {
  document.querySelector("#page-start").innerHTML = `
    <div class="ref-start-layout">
      <section class="start-hero-panel">
        <div class="start-hero-copy">
          <p class="eyebrow">专注标注 · 并行推进 · 实时洞察</p>
          <h1>专注数据标注、Prompt 测评与算法迭代</h1>
          <p>平台围绕数据标注的 Prompt 评测与算法验证展开，把任务组织、方案配置、标注执行、结果分析和过程可视化集中到一个清晰的工作界面。</p>
        </div>
        <div class="start-hero-summary" aria-label="平台价值">
          <div>
            <span>Focus</span>
            <strong>围绕标注数据沉淀关键判断</strong>
          </div>
          <div>
            <span>Parallel</span>
            <strong>多线程、多方案同步推进</strong>
          </div>
          <div>
            <span>Visible</span>
            <strong>过程指标和结果分布统一可见</strong>
          </div>
        </div>
      </section>

      <div class="start-guide-main">
        <section class="start-principle-panel" aria-label="核心能力说明">
          <div class="start-section-head">
            <span>CAPABILITY</span>
            <h2>核心能力</h2>
            <p>展示平台对标注任务的支持方式，帮助用户理解工具价值。</p>
          </div>
          <div class="start-principle-list">
            <div class="start-principle-row">
              <strong>核心专注</strong>
              <p>围绕标注数据、Prompt 评测和算法效果沉淀关键判断。</p>
            </div>
            <div class="start-principle-row">
              <strong>高效标注</strong>
              <p>支持多线程、多方案同步标注，加快批量任务推进。</p>
            </div>
            <div class="start-principle-row">
              <strong>实时分析</strong>
              <p>标注数据持续汇总，过程指标和结果变化即时呈现。</p>
            </div>
            <div class="start-principle-row">
              <strong>全程可视化</strong>
              <p>标注进度、样本状态、方案表现和结果分布统一可见。</p>
            </div>
          </div>
          <div class="start-dev-section" aria-label="开发接入说明">
            <div class="start-section-head">
              <span>DEVELOPMENT</span>
              <h2>只需关注接入包</h2>
              <p>后台负责资源管理、并发任务和结果展示。开发人员只需要补充大模型调用逻辑，就能把自定义标注方法接入平台工作流。</p>
            </div>
            <div class="start-principle-list start-dev-list">
              <div class="start-principle-row">
                <strong>代码位置</strong>
                <p>主要关注 <code>user_hooks/</code>，标注任务会从这里读取自定义接入逻辑。</p>
              </div>
              <div class="start-principle-row">
                <strong>入口结构</strong>
                <p><code>llm_chat.py</code>、<code>annotation_methods.py</code>、<code>prompt_init_methods.py</code> 和 <code>analysis_methods.py</code> 分别维护不同扩展点。</p>
              </div>
              <div class="start-principle-row">
                <strong>必改方法</strong>
                <p>实现 <code>llm_chat_function</code>，接收单个 Prompt，返回可 JSON 化的标注结果。</p>
              </div>
              <div class="start-principle-row">
                <strong>可选扩展</strong>
                <p>需要自定义标注、Prompt 初始化或分析时，在对应文件里注册并实现方法。</p>
              </div>
            </div>
          </div>
        </section>

        <section class="start-journey-panel" aria-label="核心工作流">
          <div class="start-section-head">
            <span>WORKFLOW</span>
            <h2>核心工作流</h2>
            <p>从场景准备到批量标注，形成连续的数据处理路径。</p>
          </div>
          <ol class="start-journey-list">
            <li>
              <span>1</span>
              <div>
                <strong>创建场景</strong>
                <p>按业务链路或评测任务组织数据。</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>导入资源</strong>
                <p>Excel、Prompt、知识库、错题集统一归档。</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>编写自定义标注方法</strong>
                <p>在 <code>user_hooks/llm_chat.py</code> 的 <code>llm_chat_function</code> 中实现大模型调用。</p>
              </div>
            </li>
            <li>
              <span>4</span>
              <div>
                <strong>配置方案</strong>
                <p>选择模型、并发数和后台方法。</p>
              </div>
            </li>
            <li>
              <span>5</span>
              <div>
                <strong>标注数据</strong>
                <p>工具负责批量执行、实时分析和可视化结果。</p>
              </div>
            </li>
          </ol>
        </section>
      </div>
    </div>
  `;
}
