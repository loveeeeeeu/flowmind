import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router';
import {
  createKnowledgeBase,
  createTextDocument,
  deleteKnowledgeBase,
  getKnowledgeBases,
  getKnowledgeChunks,
  getKnowledgeDocuments,
  retryKnowledgeDocument,
  searchKnowledge,
  updateKnowledgeBase,
  type KnowledgeBase,
  type KnowledgeDocument,
} from '../../api/knowledge';
import { getAvailableModels } from '../../api/models';
import { queryKeys } from '../../api/queryKeys';
import { useProjectPermissions } from '../../auth/useProjectPermissions';

type KnowledgeTab = 'documents' | 'retrieval' | 'settings';
type CreateKnowledgeInput = { name: string; description?: string; embeddingModelId: string; documentName?: string; text?: string };

function invalidateKnowledge(queryClient: ReturnType<typeof useQueryClient>, projectId: string, knowledgeBaseId?: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.list(projectId) });
  if (knowledgeBaseId) void queryClient.invalidateQueries({ queryKey: queryKeys.knowledgeBases.documents(projectId, knowledgeBaseId) });
}

export function KnowledgeBasePage() {
  const { projectId = '' } = useParams();
  const queryClient = useQueryClient();
  const { canEdit } = useProjectPermissions(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const basesQuery = useQuery({ queryKey: queryKeys.knowledgeBases.list(projectId), queryFn: () => getKnowledgeBases(projectId) });
  const modelsQuery = useQuery({ queryKey: queryKeys.models.available(projectId), queryFn: () => getAvailableModels(projectId, 'EMBEDDING') });
  const createMutation = useMutation({
    mutationFn: async (input: CreateKnowledgeInput) => {
      const base = await createKnowledgeBase(projectId, input);
      if (input.text?.trim()) {
        await createTextDocument(projectId, base.id, { name: input.documentName?.trim() || `${input.name} 文档`, text: input.text });
      }
      return base;
    },
    onSuccess: (base) => {
      setSelectedId(base.id);
      setShowCreate(false);
      invalidateKnowledge(queryClient, projectId);
    },
  });
  const selected = basesQuery.data?.find((base) => base.id === selectedId) ?? null;

  if (showCreate) {
    return <KnowledgeCreationWizard models={modelsQuery.data ?? []} pending={createMutation.isPending} error={createMutation.error?.message} onBack={() => setShowCreate(false)} onSubmit={(input) => createMutation.mutate(input)} />;
  }

  if (selected) {
    return <KnowledgeBaseDetail projectId={projectId} knowledgeBase={selected} canEdit={canEdit} onBack={() => setSelectedId(null)} />;
  }

  return (
    <main className="workspace-page knowledge-hub">
      <header className="knowledge-hub-header">
        <div>
          <p className="page-eyebrow">KNOWLEDGE</p>
          <h1>知识库</h1>
          <p>集中管理可供工作流检索的文档与数据。</p>
        </div>
        <button className="primary-button knowledge-create-button" type="button" disabled={!canEdit} onClick={() => setShowCreate(true)}>＋ 创建知识库</button>
      </header>

      <div className="knowledge-hub-toolbar">
        <div className="knowledge-filter active">全部知识库 <span>{basesQuery.data?.length ?? 0}</span></div>
        <label className="knowledge-search-input"><span>⌕</span><input disabled placeholder="搜索知识库（即将支持）" /></label>
      </div>

      {basesQuery.isError && <p className="error-message">加载知识库失败：{basesQuery.error.message}</p>}
      {basesQuery.isPending && <div className="knowledge-empty-card">正在加载知识库…</div>}
      {basesQuery.isSuccess && (
        <section className="knowledge-card-grid">
          {canEdit && <button className="knowledge-new-card" type="button" onClick={() => setShowCreate(true)}><span>＋</span><strong>创建知识库</strong><small>连接文档，构建可检索的知识</small></button>}
          {basesQuery.data.map((base) => <KnowledgeBaseCard key={base.id} base={base} onOpen={() => setSelectedId(base.id)} />)}
          {basesQuery.data.length === 0 && !canEdit && <div className="knowledge-empty-card">该项目还没有知识库。</div>}
        </section>
      )}

    </main>
  );
}

function KnowledgeBaseCard({ base, onOpen }: { base: KnowledgeBase; onOpen: () => void }) {
  return (
    <button className="knowledge-base-card" type="button" onClick={onOpen}>
      <div className="knowledge-card-top"><span className="knowledge-card-icon">▦</span><StatusPill status={base.enabled ? '已启用' : '已停用'} /></div>
      <strong>{base.name}</strong>
      <p>{base.description || '暂无描述'}</p>
      <footer><span>{base._count.documents} 个文档</span><span>{base.embeddingModel?.name ?? '未配置模型'}</span></footer>
    </button>
  );
}

function KnowledgeCreationWizard({ models, pending, error, onBack, onSubmit }: {
  models: Awaited<ReturnType<typeof getAvailableModels>>;
  pending: boolean;
  error?: string;
  onBack: () => void;
  onSubmit: (input: CreateKnowledgeInput) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [modelId, setModelId] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [text, setText] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const canAdvance = name.trim() !== '' && modelId !== '';
  return (
    <main className="knowledge-wizard">
      <header className="knowledge-wizard-header"><button type="button" className="knowledge-back" onClick={onBack}>← 知识库</button><WizardSteps step={step} /></header>
      {step === 1 ? (
        <section className="knowledge-wizard-source">
          <h1>选择数据源</h1>
          <p>先选择知识来源。当前仅“粘贴文本”已接入后端处理链路。</p>
          <div className="wizard-source-options">
            <button className="selected" type="button"><span>▤</span><div><strong>粘贴文本</strong><small>直接输入或粘贴已有内容</small></div></button>
            <button disabled type="button"><span>⇧</span><div><strong>导入文件</strong><small>PDF、Word、Markdown 等</small></div><em>即将支持</em></button>
            <button disabled type="button"><span>◉</span><div><strong>同步 Notion</strong><small>连接 Notion 工作区</small></div><em>即将支持</em></button>
            <button disabled type="button"><span>⌁</span><div><strong>同步 Web 站点</strong><small>抓取网站并定时同步</small></div><em>即将支持</em></button>
          </div>
          <form className="wizard-source-form" onSubmit={(event) => { event.preventDefault(); if (canAdvance) setStep(2); }}>
            <label>知识库名称<input required autoFocus value={name} placeholder="例如：员工手册" onChange={(event) => setName(event.target.value)} /></label>
            <label>Embedding 模型<select required value={modelId} onChange={(event) => setModelId(event.target.value)}><option value="">请选择向量模型</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.embeddingDimensions ?? '?'} 维</option>)}</select></label>
            <label className="wizard-span-two">知识库描述（可选）<input value={description} placeholder="说明此知识库包含哪些内容" onChange={(event) => setDescription(event.target.value)} /></label>
            <label>文档名称<input value={documentName} placeholder="例如：员工手册正文" onChange={(event) => setDocumentName(event.target.value)} /></label>
            <label className="wizard-span-two">文档正文（可稍后添加）<textarea value={text} placeholder="粘贴需要入库的正文内容。系统会在创建后异步切块并生成向量。" onChange={(event) => setText(event.target.value)} /></label>
            {models.length === 0 && <p className="knowledge-form-warning wizard-span-two">还没有可用的 Embedding 模型。请先在「模型设置」中创建类型为 EMBEDDING 的模型。</p>}
            <footer className="wizard-actions wizard-span-two"><button className="primary-button" disabled={!canAdvance || models.length === 0}>下一步 →</button></footer>
          </form>
        </section>
      ) : (
        <section className="knowledge-wizard-config">
          <div className="wizard-config-main"><h1>文本分段与清洗</h1><p>这些参数决定文本如何进入 Chunk。当前后端采用默认 TextChunker 配置，因此以下项仅展示。</p><ChunkingPreview modelName={models.find((model) => model.id === modelId)?.name ?? 'Embedding 模型'} /><RetrievalPreview /></div>
          <aside className="wizard-preview"><div><span>▦</span><strong>{documentName || '文档预览'}</strong></div><div className="wizard-preview-empty">上传或粘贴的内容将在这里预览</div></aside>
          <footer className="wizard-actions wizard-config-footer"><button className="subtle-button" type="button" onClick={() => setStep(1)}>← 上一步</button><button className="primary-button" disabled={pending} onClick={() => onSubmit({ name, description: description || undefined, embeddingModelId: modelId, documentName, text })}>{pending ? '正在创建…' : '创建并处理'}</button>{error && <p className="error-message">{error}</p>}</footer>
        </section>
      )}
    </main>
  );
}

function WizardSteps({ step }: { step: 1 | 2 }) {
  return <ol className="wizard-steps"><li className={step === 1 ? 'active' : 'done'}><span>1</span> 选择数据源</li><li className={step === 2 ? 'active' : ''}><span>2</span> 文本分段与清洗</li><li><span>3</span> 处理并完成</li></ol>;
}

function ChunkingPreview({ modelName }: { modelName: string }) {
  return <section className="wizard-config-section"><h2>分段设置</h2><article className="wizard-option-card selected"><header><span>◉</span><div><strong>通用</strong><p>适用于绝大多数文本的默认分段方式。</p></div></header><div className="wizard-field-grid"><label>分段标识符<input disabled value="\n\n" readOnly /></label><label>分段最大长度<input disabled value="默认值" readOnly /></label><label>分段重叠长度<input disabled value="默认值" readOnly /></label></div><label className="wizard-check"><input disabled checked type="checkbox" readOnly /> 清除连续的空格、换行符和制表符</label></article><article className="wizard-option-card disabled"><header><span>⌘</span><div><strong>父子分段</strong><p>适合长文档的层级检索。</p></div></header><em>后端尚未实现</em></article><div className="wizard-model-line"><span>Embedding 模型</span><strong>{modelName}</strong><small>当前知识库创建后不可更换</small></div></section>;
}

function RetrievalPreview() {
  return <section className="wizard-config-section"><h2>检索设置</h2><article className="wizard-option-card selected"><header><span>⌕</span><div><strong>向量检索</strong><p>根据问题的语义相似度召回已入库的文本分段。</p></div></header><div className="wizard-field-grid two"><label>Top K<input disabled value="3" readOnly /></label><label>Score 阈值<input disabled value="后端默认" readOnly /></label></div></article><article className="wizard-option-card disabled"><header><span>✦</span><div><strong>混合检索 / Rerank</strong><p>关键词检索、重排序模型与高级召回策略。</p></div></header><em>即将支持</em></article></section>;
}

function KnowledgeBaseDetail({ projectId, knowledgeBase, canEdit, onBack }: { projectId: string; knowledgeBase: KnowledgeBase; canEdit: boolean; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<KnowledgeTab>('documents');
  const [textName, setTextName] = useState('');
  const [text, setText] = useState('');
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const documentsQuery = useQuery({
    queryKey: queryKeys.knowledgeBases.documents(projectId, knowledgeBase.id),
    queryFn: () => getKnowledgeDocuments(projectId, knowledgeBase.id),
    refetchInterval: (query) => query.state.data?.some((document) => document.status === 'PENDING' || document.status === 'PROCESSING') ? 2_000 : false,
  });
  const modelsQuery = useQuery({ queryKey: queryKeys.models.available(projectId), queryFn: () => getAvailableModels(projectId, 'EMBEDDING') });
  const chunksQuery = useQuery({
    queryKey: queryKeys.knowledgeBases.chunks(projectId, knowledgeBase.id, selectedDocumentId ?? ''),
    queryFn: () => getKnowledgeChunks(projectId, knowledgeBase.id, selectedDocumentId!),
    enabled: Boolean(selectedDocumentId),
  });
  const addDocument = useMutation({
    mutationFn: () => createTextDocument(projectId, knowledgeBase.id, { name: textName, text }),
    onSuccess: () => { setTextName(''); setText(''); invalidateKnowledge(queryClient, projectId, knowledgeBase.id); },
  });
  const retry = useMutation({ mutationFn: (documentId: string) => retryKnowledgeDocument(projectId, knowledgeBase.id, documentId), onSuccess: () => invalidateKnowledge(queryClient, projectId, knowledgeBase.id) });
  const toggle = useMutation({ mutationFn: () => updateKnowledgeBase(projectId, knowledgeBase.id, { enabled: !knowledgeBase.enabled }), onSuccess: () => invalidateKnowledge(queryClient, projectId) });
  const updateModel = useMutation({ mutationFn: (embeddingModelId: string) => updateKnowledgeBase(projectId, knowledgeBase.id, { embeddingModelId }), onSuccess: () => invalidateKnowledge(queryClient, projectId) });
  const remove = useMutation({ mutationFn: () => deleteKnowledgeBase(projectId, knowledgeBase.id), onSuccess: () => { invalidateKnowledge(queryClient, projectId); onBack(); } });

  return (
    <main className="knowledge-detail-page">
      <header className="knowledge-detail-header">
        <button type="button" className="knowledge-back" onClick={onBack}>← 知识库</button>
        <div className="knowledge-detail-title"><span className="knowledge-card-icon large">▦</span><div><h1>{knowledgeBase.name}</h1><p>{knowledgeBase.description || '暂无描述'}</p></div></div>
        <StatusPill status={knowledgeBase.enabled ? '已启用' : '已停用'} />
      </header>
      <div className="knowledge-detail-shell">
        <aside className="knowledge-detail-nav">
          <button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}>▤ 文档 <span>{knowledgeBase._count.documents}</span></button>
          <button className={tab === 'retrieval' ? 'active' : ''} onClick={() => setTab('retrieval')}>⌕ 检索测试</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>⚙ 设置</button>
          <div className="knowledge-nav-note"><strong>RAG 工作流</strong><p>在画布中添加 Knowledge Retriever 节点后，可选择此知识库。</p></div>
        </aside>
        <section className="knowledge-main-panel">
          {tab === 'documents' && <DocumentsTab canEdit={canEdit} knowledgeBase={knowledgeBase} documents={documentsQuery.data ?? []} loading={documentsQuery.isPending} textName={textName} text={text} pending={addDocument.isPending} error={addDocument.error?.message} chunks={chunksQuery.data ?? []} chunksLoading={chunksQuery.isPending} selectedDocumentId={selectedDocumentId} onTextName={setTextName} onText={setText} onSubmit={() => addDocument.mutate()} onSelectDocument={setSelectedDocumentId} onRetry={(id) => retry.mutate(id)} />}
          {tab === 'retrieval' && <RetrievalTab projectId={projectId} knowledgeBaseId={knowledgeBase.id} />}
          {tab === 'settings' && <SettingsTab canEdit={canEdit} knowledgeBase={knowledgeBase} models={modelsQuery.data ?? []} togglePending={toggle.isPending} modelPending={updateModel.isPending} deletePending={remove.isPending} modelError={updateModel.error?.message} onToggle={() => toggle.mutate()} onChangeModel={(id) => updateModel.mutate(id)} onDelete={() => window.confirm('删除知识库会同时删除文档和 Chunk。若已被工作流引用，后端会拒绝删除。') && remove.mutate()} />}
        </section>
      </div>
    </main>
  );
}

function DocumentsTab(props: {
  canEdit: boolean; knowledgeBase: KnowledgeBase; documents: KnowledgeDocument[]; loading: boolean; textName: string; text: string; pending: boolean; error?: string; chunks: Array<{ id: string; chunkIndex: number; content: string }>; chunksLoading: boolean; selectedDocumentId: string | null;
  onTextName: (value: string) => void; onText: (value: string) => void; onSubmit: () => void; onSelectDocument: (id: string | null) => void; onRetry: (id: string) => void;
}) {
  const { canEdit, knowledgeBase, documents, loading, textName, text, pending, error, chunks, chunksLoading, selectedDocumentId, onTextName, onText, onSubmit, onSelectDocument, onRetry } = props;
  const canIngest = canEdit && knowledgeBase.enabled && Boolean(knowledgeBase.embeddingModelId);
  return <>
    <header className="knowledge-content-header"><div><h2>文档</h2><p>将内容处理为 Chunk 和向量，供工作流检索。</p></div><span className="knowledge-count">{documents.length} 个文档</span></header>
    <section className="knowledge-source-grid">
      <article className="knowledge-source-card active"><span>▤</span><div><strong>粘贴文本</strong><p>适合快速验证知识库与检索。</p></div></article>
      <article className="knowledge-source-card disabled"><span>⇧</span><div><strong>上传文件</strong><p>PDF、Word 等文件解析尚未接入。</p></div><em>即将支持</em></article>
      <article className="knowledge-source-card disabled"><span>⌁</span><div><strong>同步网页</strong><p>URL 抓取与定时同步尚未接入。</p></div><em>即将支持</em></article>
    </section>
    <form className="knowledge-text-editor" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div><input required disabled={!canIngest} value={textName} placeholder="文档名称，例如：员工报销制度" onChange={(event) => onTextName(event.target.value)} /><span>{knowledgeBase.embeddingModel?.name ?? '未配置模型'}</span></div>
      <textarea required disabled={!canIngest} value={text} placeholder="粘贴文档正文。系统会由 Worker 异步切块、生成向量，并将状态更新为 READY。" onChange={(event) => onText(event.target.value)} />
      <footer><p>{!knowledgeBase.enabled ? '知识库已停用，不能新增文档。' : !knowledgeBase.embeddingModelId ? '请先在「设置」中选择 Embedding 模型。' : '文本会进入异步队列处理。'}</p><button className="primary-button" disabled={!canIngest || pending}>{pending ? '正在提交…' : '添加到知识库'}</button></footer>
      {error && <p className="error-message">{error}</p>}
    </form>
    <section className="knowledge-document-table"><header><strong>文档名称</strong><span>状态</span><span>分段</span><span>更新时间</span><span /></header>
      {loading && <p className="knowledge-table-empty">加载文档中…</p>}
      {!loading && documents.length === 0 && <p className="knowledge-table-empty">还没有文档。可以先粘贴一段文本验证入库链路。</p>}
      {documents.map((document) => <article key={document.id} className={selectedDocumentId === document.id ? 'selected' : ''}><button type="button" onClick={() => onSelectDocument(selectedDocumentId === document.id ? null : document.id)}><strong>{document.name}</strong><small>文本 · {new Date(document.updatedAt).toLocaleString()}</small></button><StatusPill status={document.status} /><span>{document._count.chunks}</span><time>{new Date(document.updatedAt).toLocaleDateString()}</time>{document.status === 'FAILED' ? <button className="subtle-button" disabled={!canEdit} onClick={() => onRetry(document.id)}>重试</button> : <button className="knowledge-row-link" type="button" onClick={() => onSelectDocument(document.id)}>查看</button>}{document.errorMessage && <p className="knowledge-document-error">{document.errorCode}: {document.errorMessage}</p>}</article>)}
    </section>
    {selectedDocumentId && <section className="knowledge-chunk-drawer"><header><div><h3>切分预览</h3><p>后端已保存的 Chunk，按 chunkIndex 排序。</p></div><button className="knowledge-close" onClick={() => onSelectDocument(null)}>×</button></header>{chunksLoading ? <p>加载中…</p> : chunks.map((chunk) => <details key={chunk.id}><summary>Chunk {chunk.chunkIndex}</summary><p>{chunk.content}</p></details>)}</section>}
  </>;
}

function RetrievalTab({ projectId, knowledgeBaseId }: { projectId: string; knowledgeBaseId: string }) {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(3);
  const search = useMutation({ mutationFn: () => searchKnowledge(projectId, knowledgeBaseId, { query, topK }) });
  return <><header className="knowledge-content-header"><div><h2>检索测试</h2><p>在把知识库接入工作流前，先验证召回内容。</p></div></header>
    <section className="knowledge-retrieval-form"><form onSubmit={(event) => { event.preventDefault(); search.mutate(); }}><label>查询问题<input required value={query} placeholder="例如：员工住宿报销上限是多少？" onChange={(event) => setQuery(event.target.value)} /></label><label>召回数量<select value={topK} onChange={(event) => setTopK(Number(event.target.value))}>{[1, 3, 5, 10].map((value) => <option key={value} value={value}>Top {value}</option>)}</select></label><button className="primary-button" disabled={search.isPending}>{search.isPending ? '检索中…' : '开始检索'}</button></form><p>向量模型会先把问题转为向量，再从已完成入库的 Chunk 中按相似度取回结果。</p></section>
    <section className="knowledge-advanced-card"><div><strong>召回设置</strong><p>相似度阈值、混合检索、重排序模型</p></div><button disabled>即将支持</button></section>
    {search.error && <p className="error-message">检索失败：{search.error.message}</p>}
    {search.data && <section className="knowledge-retrieval-results"><h3>检索结果 <span>{search.data.items.length}</span></h3>{search.data.items.length === 0 ? <div className="knowledge-table-empty">没有命中。请确认文档已进入 READY 状态，并尝试与文档内容更相关的问题。</div> : search.data.items.map((item, index) => <article key={item.chunkId}><header><strong>#{index + 1} {item.documentName}</strong><span>相似度 {item.score.toFixed(3)}</span></header><small>Chunk {item.chunkIndex}</small><p>{item.content}</p></article>)}</section>}
  </>;
}

function SettingsTab({ canEdit, knowledgeBase, models, togglePending, modelPending, deletePending, modelError, onToggle, onChangeModel, onDelete }: {
  canEdit: boolean; knowledgeBase: KnowledgeBase; models: Awaited<ReturnType<typeof getAvailableModels>>; togglePending: boolean; modelPending: boolean; deletePending: boolean; modelError?: string; onToggle: () => void; onChangeModel: (id: string) => void; onDelete: () => void;
}) {
  return <><header className="knowledge-content-header"><div><h2>知识库设置</h2><p>配置向量模型与知识库可用状态。</p></div></header>
    <section className="knowledge-settings-card"><div><h3>Embedding 模型</h3><p>文档与查询必须使用相同维度的模型。已有文档后不可变更，以避免向量混用。</p></div><select value={knowledgeBase.embeddingModelId ?? ''} disabled={!canEdit || knowledgeBase._count.documents > 0 || modelPending} onChange={(event) => onChangeModel(event.target.value)}><option value="">请选择模型</option>{knowledgeBase.embeddingModel && !models.some((model) => model.id === knowledgeBase.embeddingModelId) && <option value={knowledgeBase.embeddingModelId ?? ''}>{knowledgeBase.embeddingModel.name}（不可用）</option>}{models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.embeddingDimensions ?? '?'} 维</option>)}</select>{knowledgeBase._count.documents > 0 && <small>已有文档，模型已锁定。</small>}{modelError && <p className="error-message">{modelError}</p>}</section>
    <section className="knowledge-settings-card"><div><h3>知识库状态</h3><p>停用后，新工作流无法选择该知识库；已发布版本仍保留历史配置。</p></div><button className="subtle-button" disabled={!canEdit || togglePending} onClick={onToggle}>{knowledgeBase.enabled ? '停用知识库' : '启用知识库'}</button></section>
    <section className="knowledge-danger-card"><div><h3>删除知识库</h3><p>会删除其文档、Chunk 与向量；如仍被工作流引用，服务端会拒绝删除。</p></div><button className="subtle-button credential-revoke" disabled={!canEdit || deletePending} onClick={onDelete}>删除</button></section>
  </>;
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized === 'ready' || normalized === '已启用' ? 'success' : normalized === 'failed' || normalized === '已停用' ? 'danger' : normalized === 'processing' || normalized === 'pending' ? 'warning' : 'neutral';
  return <span className={`knowledge-status ${tone}`}>{status}</span>;
}
