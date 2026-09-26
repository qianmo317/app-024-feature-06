// 谜库筛选（性能：2000 条 < 100ms，纯函数便于基准测试）
import type { Riddle, RiddleCategory, RiddleFormat, Verdict } from '../types';
import { CATEGORY_LABEL, FORMAT_LABEL, VERDICT_LABEL } from '../types';
import { normalizeText } from './normalize';
import { stars } from './format';

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

/** 是否设置了任一筛选条件 */
export function hasActiveFilters(f: RiddleFilters): boolean {
  return !!(f.q.trim() || f.category || f.format || f.difficulty || f.verdict || f.tag);
}

/**
 * 逐条说明某谜命中了当前哪些筛选条件（「只看已选」视图用）。
 * 只列出已设置且命中的条件；未设置的条件不参与说明。
 */
export function matchReasons(r: Riddle, f: RiddleFilters): string[] {
  const reasons: string[] = [];
  if (f.category && r.category === f.category) reasons.push(`谜目「${CATEGORY_LABEL[r.category]}」`);
  if (f.format && r.format === f.format) reasons.push(`谜格「${FORMAT_LABEL[r.format]}」`);
  if (f.difficulty && r.difficulty === f.difficulty) reasons.push(`难度 ${stars(f.difficulty)}`);
  if (f.verdict && r.check.verdict === f.verdict) reasons.push(`校验「${VERDICT_LABEL[f.verdict]}」`);
  if (f.tag && r.tags.includes(f.tag)) reasons.push(`标签「${f.tag}」`);
  const q = f.q.trim().toLowerCase();
  if (q) {
    const qn = normalizeText(f.q);
    const hit: string[] = [];
    if (r.surface.toLowerCase().includes(q) || (qn && normalizeText(r.surface).includes(qn))) hit.push('谜面');
    if (r.answer.toLowerCase().includes(q) || (qn && normalizeText(r.answer).includes(qn))) hit.push('谜底');
    if ((r.author ?? '').toLowerCase().includes(q)) hit.push('作者');
    if ((r.source ?? '').toLowerCase().includes(q)) hit.push('出处');
    if (String(r.no).includes(q)) hit.push('谜号');
    if (r.tags.some((t) => t.toLowerCase().includes(q))) hit.push('标签');
    if (hit.length) reasons.push(`搜索「${f.q.trim()}」命中${hit.join('、')}`);
  }
  return reasons;
}
