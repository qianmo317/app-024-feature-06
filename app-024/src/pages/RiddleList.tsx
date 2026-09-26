// 谜库列表：筛选/搜索/分页/跨页批量选中/导入两步预览/查重/导出
import { useMemo, useRef, useState } from 'react';
import { useAppState, navigate } from '../ui/router';
import { VerdictBadge, Stars } from '../ui/bits';
import { EMPTY_FILTERS, filterRiddles, allTags, hasActiveFilters, matchReasons, type RiddleFilters } from '../lib/search';
import { scanDuplicates, type DupMatch } from '../lib/duplicates';
import { importPreview, riddleToRow, stringifyCSV, withBOM, RIDDLE_CSV_HEADERS, type ImportPreview } from '../lib/csv';
import { CATEGORY_LABEL, FORMAT_LABEL, VERDICT_LABEL, type Riddle, type Verdict } from '../types';
import { downloadText, formatDateTime } from '../lib/format';
import { exportFileName, store } from '../lib/store';

const PAGE_SIZE = 50;

export function RiddleList() {
  const state = useAppState();
  const [filters, setFilters] = useState<RiddleFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<'all' | 'selected'>('all');
  const [dupResult, setDupResult] = useState<Map<string, DupMatch[]> | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => filterRiddles(state.riddles, filters), [state.riddles, filters]);
  const tags = useMemo(() => allTags(state.riddles), [state.riddles]);
  const selected = state.selected;
  // 选中集是跨页、跨筛选连续的：基于全库解析，不随翻页/改筛选丢失
  const selectedInAll = useMemo(() => state.riddles.filter((r) => selected.has(r.id)), [state.riddles, selected]);
  const filteredIds = useMemo(() => new Set(filtered.map((r) => r.id)), [filtered]);
  const selectedInFiltered = useMemo(() => filtered.reduce((n, r) => n + (selected.has(r.id) ? 1 : 0), 0), [filtered, selected]);

  const viewList = viewMode === 'selected' ? selectedInAll : filtered;
  const pageCount = Math.max(1, Math.ceil(viewList.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = viewList.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const pageAllChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pageSomeChecked = rows.some((r) => selected.has(r.id));

  const setF = (patch: Partial<RiddleFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(0); };

  const selectAllFiltered = () => {
    if (!filtered.length) return;
    store.selectMany(filtered.map((r) => r.id), true);
    setNotice(`已选中当前筛选条件下的全部 ${filtered.length} 条（跨页累计选中 ${selected.size + filtered.length - selectedInFiltered} 条）`);
  };

  const doExport = () => {
    const list = selectedInAll.length ? selectedInAll : filtered;
    if (!list.length) { setNotice('没有可导出的谜条'); return; }
    const csv = stringifyCSV([RIDDLE_CSV_HEADERS, ...list.map(riddleToRow)]);
    downloadText(exportFileName('谜库', 'csv'), withBOM(csv));
    setNotice(`已导出 ${list.length} 条${selectedInAll.length ? '（仅选中项）' : ''}`);
  };

  const doScanDup = () => {
    if (state.riddles.length < 2) { setDupResult(new Map()); setNotice('谜库不足两条，无需查重'); return; }
    const t0 = performance.now();
    const map = scanDuplicates(state.riddles);
    setNotice(`全库查重完成（${(performance.now() - t0).toFixed(0)}ms），命中 ${map.size} 条`);
    setDupResult(map);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setPreview(importPreview(text, state.riddles));
    if (fileRef.current) fileRef.current.value = '';
  };

  const confirmImport = async () => {
    if (!preview?.fresh.length) return;
    const n = await store.addRiddles(preview.fresh);
    setPreview(null);
    setNotice(`已导入 ${n} 条新谜`);
  };

  const batchDelete = async () => {
    if (!selectedInAll.length) return;
    if (!confirm(`确定删除选中的 ${selectedInAll.length} 条谜？`)) return;
    await store.removeRiddles([...selected]); // removeRiddles 会同步清掉这些 id 的选中状态
    setNotice(`已删除 ${selectedInAll.length} 条`);
  };

  const dupPairs = useMemo(() => {
    if (!dupResult) return [];
    const seen = new Set<string>();
    const pairs: { a: Riddle; b: Riddle; sim: number }[] = [];
    for (const r of state.riddles) {
      for (const m of dupResult.get(r.id) ?? []) {
        const other = state.riddles.find((x) => x.id === m.id);
        if (!other) continue;
        const key = [r.id, other.id].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ a: r, b: other, sim: m.similarity });
      }
    }
    return pairs.sort((x, y) => y.sim - x.sim);
  }, [dupResult, state.riddles]);

  const previewById = useMemo(() => {
    const m = new Map<string, Riddle>();
    for (const r of state.riddles) m.set(r.id, r);
    return m;
  }, [state.riddles]);

  return (
    <div>
      <div className="page-head">
        <h1>谜库 <small>{state.riddles.length} 条</small></h1>
        <div className="btn-row">
          <a className="btn btn-primary" href="#/riddle/new">＋ 新建谜条</a>
        </div>
      </div>

      {notice && <div className="notice">{notice}<button className="notice-x" onClick={() => setNotice('')} aria-label="关闭">×</button></div>}

      <div className="toolbar no-print">
        <input
          className="input search"
          placeholder="搜索谜面 / 谜底 / 谜号 / 标签…"
          value={filters.q}
          onChange={(e) => setF({ q: e.target.value })}
        />
        <select className="input" value={filters.category} onChange={(e) => setF({ category: e.target.value as RiddleFilters['category'] })}>
          <option value="">全部谜目</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" value={filters.format} onChange={(e) => setF({ format: e.target.value as RiddleFilters['format'] })}>
          <option value="">全部谜格</option>
          {Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" value={filters.difficulty} onChange={(e) => setF({ difficulty: Number(e.target.value) as RiddleFilters['difficulty'] })}>
          <option value={0}>全部难度</option>
          <option value={1}>★</option><option value={2}>★★</option><option value={3}>★★★</option>
        </select>
        <select className="input" value={filters.verdict} onChange={(e) => setF({ verdict: e.target.value as RiddleFilters['verdict'] })}>
          <option value="">全部校验</option>
          {(Object.keys(VERDICT_LABEL) as Verdict[]).map((k) => <option key={k} value={k}>{VERDICT_LABEL[k]}</option>)}
        </select>
        {tags.length > 0 && (
          <select className="input" value={filters.tag} onChange={(e) => setF({ tag: e.target.value })}>
            <option value="">全部标签</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      <div className="sel-bar no-print">
        <span className="sel-count">
          已选 <b>{selected.size}</b> 条
          {selected.size > 0 && <span className="muted">（跨页累计，刷新不丢）</span>}
        </span>
        {viewMode === 'all' && (
          <span className="muted">当前筛选 {filtered.length} 条 · 其中已选 {selectedInFiltered} 条</span>
        )}
        <span className="sel-actions">
          {viewMode === 'all' && (
            <button
              className="btn"
              disabled={!filtered.length || selectedInFiltered === filtered.length}
              title="一键选中当前筛选条件下的全部结果（含未翻到的页）"
              onClick={selectAllFiltered}
            >
              ☑ 选中全部筛选结果（{filtered.length}）
            </button>
          )}
          {viewMode === 'all' && selectedInFiltered > 0 && selectedInFiltered < filtered.length && (
            <button className="btn btn-ghost" onClick={() => store.selectMany(filtered.map((r) => r.id), false)}>
              取消筛选结果中的 {selectedInFiltered} 条
            </button>
          )}
          <button
            className={`btn${viewMode === 'selected' ? ' btn-primary' : ''}`}
            disabled={viewMode === 'all' && !selected.size}
            onClick={() => { setViewMode(viewMode === 'selected' ? 'all' : 'selected'); setPage(0); }}
          >
            {viewMode === 'selected' ? '← 返回全部列表' : `只看已选（${selected.size}）`}
          </button>
          {selected.size > 0 && (
            <button className="btn btn-ghost" onClick={() => store.clearSelection()}>清空选中</button>
          )}
        </span>
      </div>

      <div className="btn-row wrap no-print" style={{ marginBottom: 10 }}>
        <button className="btn btn-primary" disabled={!selected.size} onClick={() => navigate('#/print')}>
          🖨 批量出条{selected.size ? `（${selected.size}）` : ''}
        </button>
        <button className="btn" onClick={doExport}>⬇ 导出 CSV</button>
        <button className="btn" onClick={doScanDup}>🔍 全库查重</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>⬆ 导入 CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn btn-danger" disabled={!selected.size} onClick={batchDelete}>删除选中</button>
      </div>

      {preview && (
        <div className="panel panel-import">
          <h3>导入预览（两步式） — 共 {preview.total} 行</h3>
          <p className="muted">
            <b className="ok-text">新增 {preview.fresh.length}</b> ·
            <b className="warn-text"> 重复 {preview.dups.length}</b> ·
            <b className="bad-text"> 格式错误 {preview.errors.length}</b>
          </p>
          {preview.fresh.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>谜面</th><th>谜底</th><th>谜目</th><th>谜格</th></tr></thead>
                <tbody>
                  {preview.fresh.slice(0, 10).map((r, i) => (
                    <tr key={i}><td>{r.surface}</td><td>{r.answer}</td><td>{CATEGORY_LABEL[r.category]}</td><td>{FORMAT_LABEL[r.format]}</td></tr>
                  ))}
                </tbody>
              </table>
              {preview.fresh.length > 10 && <p className="muted">… 仅显示前 10 条</p>}
            </div>
          )}
          {preview.dups.length > 0 && (
            <div className="table-wrap">
              <h4>重复（不导入）</h4>
              <table>
                <thead><tr><th>行</th><th>谜面</th><th>谜底</th><th>与库内谜号</th><th>相似度</th></tr></thead>
                <tbody>
                  {preview.dups.map((d, i) => (
                    <tr key={i}><td>{d.rowIndex}</td><td>{d.surface}</td><td>{d.answer}</td><td>{d.matchNo || '文件内'}</td><td>{Math.round(d.sim * 100)}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.errors.length > 0 && (
            <div className="table-wrap">
              <h4>格式错误（不导入）</h4>
              <table>
                <thead><tr><th>行</th><th>内容</th><th>原因</th></tr></thead>
                <tbody>
                  {preview.errors.map((d, i) => <tr key={i}><td>{d.rowIndex}</td><td>{d.surface}</td><td>{d.error}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
          <div className="btn-row">
            <button className="btn btn-primary" disabled={!preview.fresh.length} onClick={confirmImport}>确认导入 {preview.fresh.length} 条</button>
            <button className="btn btn-ghost" onClick={() => setPreview(null)}>取消</button>
          </div>
        </div>
      )}

      {dupPairs.length > 0 && (
        <div className="panel">
          <h3>查重结果（{dupPairs.length} 组相似）</h3>
          <ul className="dup-list">
            {dupPairs.slice(0, 50).map((p, i) => (
              <li key={i}>
                <a href={`#/riddle/${p.a.id}`}>#{p.a.no} {p.a.surface}</a>
                <span className="muted"> ↔ </span>
                <a href={`#/riddle/${p.b.id}`}>#{p.b.no} {p.b.surface}</a>
                <span className="badge">{Math.round(p.sim * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dupResult && dupPairs.length === 0 && <div className="panel ok-text">未发现重复谜面。</div>}

      {rows.length === 0 ? (
        viewMode === 'selected' ? (
          <div className="panel empty">
            <p>还没有选中任何谜条。</p>
            <p><button className="btn btn-primary" onClick={() => setViewMode('all')}>← 返回全部列表去勾选</button></p>
          </div>
        ) : (
        <div className="panel empty">
          <p>谜库为空或没有符合筛选的谜条。</p>
          <p>
            <a className="btn btn-primary" href="#/riddle/new">＋ 新建谜条</a>{' '}
            <button className="btn" onClick={() => fileRef.current?.click()}>导入 CSV</button>{' '}
            <a className="btn" href={`${import.meta.env.BASE_URL}samples/riddles.csv`} download>下载示例谜库 CSV</a>
          </p>
        </div>
        )
      ) : (
        <div className="table-wrap">
          {viewMode === 'selected' && (
            <p className="muted small sel-view-hint">
              只看已选：共 {selectedInAll.length} 条，按谜号排序。取消勾选即移出选中；「命中筛选」说明该条命中了当前哪些筛选条件。
            </p>
          )}
          <table className="riddle-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="全选本页"
                    checked={pageAllChecked}
                    ref={(el) => { if (el) el.indeterminate = !pageAllChecked && pageSomeChecked; }}
                    onChange={(e) => store.selectMany(rows.map((r) => r.id), e.target.checked)}
                  />
                </th>
                <th>谜号</th><th>谜面</th><th>谜底</th><th>谜目</th><th>谜格</th><th>难度</th><th>校验</th>
                {viewMode === 'selected' ? <th>命中筛选</th> : <th>登记</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const recs = state.records.filter((x) => x.riddleId === r.id);
                return (
                  <tr key={r.id}>
                    <td><input type="checkbox" aria-label={`选中 ${r.no}`} checked={selected.has(r.id)} onChange={() => store.toggleSelect(r.id)} /></td>
                    <td className="no-cell">{r.no}</td>
                    <td><a className="surface-link" href={`#/riddle/${r.id}`}>{r.surface}</a>{r.tags.length > 0 && <span className="tag">{r.tags[0]}</span>}</td>
                    <td>{r.answer}</td>
                    <td>{CATEGORY_LABEL[r.category]}</td>
                    <td>{r.format === 'none' ? '' : FORMAT_LABEL[r.format]}</td>
                    <td><Stars n={r.difficulty} /></td>
                    <td><VerdictBadge verdict={r.check.verdict} /></td>
                    {viewMode === 'selected' ? (
                      <td className="reason-cell">
                        {hasActiveFilters(filters) ? (
                          <>
                            {matchReasons(r, filters).map((m) => <span className="badge" key={m}>{m}</span>)}
                            {!filteredIds.has(r.id) && <span className="badge badge-warn">不在当前筛选结果中</span>}
                          </>
                        ) : (
                          <span className="muted">无筛选条件</span>
                        )}
                      </td>
                    ) : (
                      <td>{recs.length ? <span className="badge badge-solved">{recs.length} 次猜中</span> : ''}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="pager no-print">
          <button className="btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>上一页</button>
          <span>第 {safePage + 1} / {pageCount} 页（共 {viewList.length} 条）</span>
          <button className="btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>下一页</button>
        </div>
      )}

      {state.records.length > 0 && (
        <div className="panel">
          <h3>最近登记</h3>
          <ul className="dup-list">
            {state.records.slice(0, 5).map((rec) => {
              const r = previewById.get(rec.riddleId);
              return (
                <li key={rec.id}>
                  <span className="badge badge-solved">#{r?.no ?? '?'}</span>{' '}
                  {rec.winnerName || '匿名'} · {rec.prize} · {formatDateTime(rec.at)}{rec.code ? ` · ${rec.code}` : ''}
                </li>
              );
            })}
          </ul>
          <a href="#/onsite">前往现场登记 →</a>
        </div>
      )}
    </div>
  );
}
