export function renderStartPage() {
  document.querySelector("#page-start").innerHTML = `
    <div class="start-shell">
      <section class="intro-band">
        <div>
          <p class="eyebrow">LOCAL WORKBENCH · DATA FIRST</p>
          <h1>LLM 标注工具</h1>
          <p>按场景组织数据集、Prompt、知识库和错题集，组合成标注方案后进入标注管理页面查看数据。</p>
        </div>
        <div class="intro-metrics">
          <div><strong>3</strong><span>流程阶段</span></div>
          <div><strong>4</strong><span>资源类型</span></div>
          <div><strong>5k+</strong><span>列表样本</span></div>
        </div>
      </section>

      <section class="guide-rail">
        <article class="guide-card active">
          <span>01</span>
          <div><h3>创建场景</h3><p>定义业务边界。</p></div>
        </article>
        <i></i>
        <article class="guide-card">
          <span>02</span>
          <div><h3>导入资源</h3><p>沉淀数据和知识。</p></div>
        </article>
        <i></i>
        <article class="guide-card">
          <span>03</span>
          <div><h3>配置方案</h3><p>组合模型和方法。</p></div>
        </article>
        <i></i>
        <article class="guide-card">
          <span>04</span>
          <div><h3>查看数据</h3><p>进入重列表工作台。</p></div>
        </article>
      </section>

    </div>
  `;
}
