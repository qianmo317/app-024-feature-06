// 谜库筛选（性能：2000 条 < 100ms，纯函数便于基准测试）
import { CATEGORY_LABEL, FORMAT_LABEL, VERDICT_LABEL, type Riddle, type RiddleCategory, type RiddleFormat, type Verdict } from '../types';
import { normalizeText } from './normalize';

export interface RiddleFilters {
  q: string;
  category: RiddleCategory | '';
  format: RiddleFormat | '';
  difficulty: 0 | 1 | 2 | 3; // 0 = 全部
  verdict: Verdict | '';
  tag: string;
}

export const EMPTY_FILTERS: RiddleFilters = { q: '', category: '', format: '', difficulty: 0, verdict: '', tag: '' };

export function filterRiddles(list: Riddle[], f: RiddleFilters): Riddle[] {
  const q = f.q.trim().toLowerCase();
  const qn = q ? normalizeText(f.q) : '';
  const out: Riddle[] = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (f.category && r.category !== f.category) continue;
    if (f.format && r.format !== f.format) continue;
    if (f.difficulty && r.difficulty !== f.difficulty) continue;
    if (f.verdict && r.check.verdict !== f.verdict) continue;
    if (f.tag && !r.tags.includes(f.tag)) continue;
    if (q) {
      if (
        !r.surface.toLowerCase().includes(q) &&
        !r.answer.toLowerCase().includes(q) &&
        !(r.author ?? '').toLowerCase().includes(q) &&
        !(r.source ?? '').toLowerCase().includes(q) &&
        !String(r.no).includes(q) &&
        !r.tags.some((t) => t.toLowerCase().includes(q)) &&
        // 中文查询走归一化（去标点/繁简）
        !(qn && (normalizeText(r.surface).includes(qn) || normalizeText(r.answer).includes(qn)))
      ) continue;
    }
    out.push(r);
  }
  return out;
}

export function allTags(list: Riddle[]): string[] {
  const set = new Set<string>();
  for (const r of list) for (const t of r.tags) set.add(t);
  return [...set].sort();
}

/** 是否有任一筛选条件生效（用于「只看已选」的命中说明） */
export function hasActiveFilters(f: RiddleFilters): boolean {
  return !!(f.q.trim() || f.category || f.format || f.difficulty || f.verdict || f.tag);
}

function matchKeyword(r: Riddle, f: RiddleFilters): boolean {
  const q = f.q.trim().toLowerCase();
  if (!q) return false;
  const qn = normalizeText(f.q);
  return (
    r.surface.toLowerCase().includes(q) ||
    r.answer.toLowerCase().includes(q) ||
    (r.author ?? '').toLowerCase().includes(q) ||
    (r.source ?? '').toLowerCase().includes(q) ||
    String(r.no).includes(q) ||
    r.tags.some((t) => t.toLowerCase().includes(q)) ||
    !!(qn && (normalizeText(r.surface).includes(qn) || normalizeText(r.answer).includes(qn)))
  );
}

/**
 * 逐条说明该谜命中了当前哪些筛选条件（与 filterRiddles 同口径，AND 语义）。
 * 返回人类可读标签列表，如 ['关键词「牛」', '谜目：猜一字']；空数组表示一条都没命中。
 */
export function matchReasons(r: Riddle, f: RiddleFilters): string[] {
  const out: string[] = [];
  if (f.q.trim() && matchKeyword(r, f)) out.push(`关键词「${f.q.trim()}」`);
  if (f.category && r.category === f.category) out.push(`谜目：${CATEGORY_LABEL[f.category]}`);
  if (f.format && r.format === f.format) out.push(`谜格：${FORMAT_LABEL[f.format]}`);
  if (f.difficulty && r.difficulty === f.difficulty) out.push(`难度：${'★'.repeat(f.difficulty)}`);
  if (f.verdict && r.check.verdict === f.verdict) out.push(`校验：${VERDICT_LABEL[f.verdict]}`);
  if (f.tag && r.tags.includes(f.tag)) out.push(`标签：${f.tag}`);
  return out;
}
