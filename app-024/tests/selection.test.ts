// 跨页选中：筛选命中说明（matchReasons）+ 选中集持久化（IndexedDB KV）
import { describe, it, expect, beforeAll } from 'vitest';
import { matchReasons, hasActiveFilters, EMPTY_FILTERS, filterRiddles, type RiddleFilters } from '../src/lib/search';
import { store } from '../src/lib/store';
import * as idb from '../src/lib/idb';
import type { Riddle } from '../src/types';

let seq = 0;
function mk(patch: Partial<Riddle> = {}): Riddle {
  seq++;
  return {
    id: `id${seq}`, no: seq, surface: `谜面${seq}`, answer: `答${seq}`, category: 'char', format: 'none',
    difficulty: 2, tags: [], check: { verdict: 'pass', reasons: [], checkedAt: 0 },
    ...patch,
  };
}

const F = (patch: Partial<RiddleFilters>): RiddleFilters => ({ ...EMPTY_FILTERS, ...patch });

describe('hasActiveFilters', () => {
  it('空筛选为 false', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });
  it('任一条件生效为 true（含仅关键词）', () => {
    expect(hasActiveFilters(F({ q: '牛' }))).toBe(true);
    expect(hasActiveFilters(F({ category: 'idiom' }))).toBe(true);
    expect(hasActiveFilters(F({ difficulty: 3 }))).toBe(true);
    expect(hasActiveFilters(F({ tag: '元宵' }))).toBe(true);
  });
});

describe('matchReasons 命中条件说明', () => {
  it('无筛选条件时返回空', () => {
    expect(matchReasons(mk(), EMPTY_FILTERS)).toEqual([]);
  });
  it('关键词命中谜面', () => {
    const r = mk({ surface: '一口咬掉牛尾巴' });
    expect(matchReasons(r, F({ q: '牛尾巴' }))).toEqual(['关键词「牛尾巴」']);
  });
  it('关键词命中谜号', () => {
    const r = mk({ no: 42 });
    expect(matchReasons(r, F({ q: '42' }))).toContain('关键词「42」');
  });
  it('关键词未命中则不出现', () => {
    const r = mk({ surface: '风平浪静' });
    expect(matchReasons(r, F({ q: '牛' }))).toEqual([]);
  });
  it('谜目/谜格/难度/校验/标签分别说明', () => {
    const r = mk({ category: 'idiom', format: 'qiqian', difficulty: 3, tags: ['元宵'], check: { verdict: 'suspect', reasons: [], checkedAt: 0 } });
    const got = matchReasons(r, F({ category: 'idiom', format: 'qiqian', difficulty: 3, verdict: 'suspect', tag: '元宵' }));
    expect(got).toEqual(['谜目：猜成语', '谜格：秋千格', '难度：★★★', '校验：存疑', '标签：元宵']);
  });
  it('只列出命中的条件，未命中不列出', () => {
    const r = mk({ category: 'idiom', difficulty: 1 });
    const got = matchReasons(r, F({ category: 'idiom', difficulty: 3 }));
    expect(got).toEqual(['谜目：猜成语']); // 难度不命中不出现在说明里
  });
  it('与 filterRiddles 同口径：全部条件命中 ⇔ 在筛选结果中', () => {
    const r = mk({ category: 'place', difficulty: 2, surface: '日近黄昏' });
    const f = F({ category: 'place', difficulty: 2, q: '黄昏' });
    expect(matchReasons(r, f)).toHaveLength(3);
    expect(filterRiddles([r], f)).toHaveLength(1);
    const f2 = F({ category: 'place', difficulty: 3 });
    expect(matchReasons(r, f2)).toHaveLength(1); // 只命中谜目
    expect(filterRiddles([r], f2)).toHaveLength(0); // AND 语义下不在结果中
  });
});

describe('选中集持久化（IndexedDB KV，无 IndexedDB 时内存降级）', () => {
  beforeAll(async () => {
    await store.init();
    store.clearSelection();
  });

  it('toggleSelect / selectMany / clearSelection 均写入 KV', async () => {
    const a = mk(); const b = mk(); const c = mk();
    await store.addRiddles([a, b, c]);
    const ids = store.getState().riddles.slice(-3).map((r) => r.id);
    const [ia, ib, ic] = ids;

    store.toggleSelect(ia);
    store.toggleSelect(ib);
    expect(new Set(await idb.getKV<string[]>('selection') ?? [])).toEqual(new Set([ia, ib]));

    store.toggleSelect(ia); // 逐条取消
    expect(await idb.getKV('selection')).toEqual([ib]);

    store.selectMany([ia, ic], true); // 跨页批量选中
    expect(new Set(await idb.getKV<string[]>('selection') ?? [])).toEqual(new Set([ia, ib, ic]));

    store.selectMany([ib], false);
    expect(new Set(await idb.getKV<string[]>('selection') ?? [])).toEqual(new Set([ia, ic]));

    store.clearSelection();
    expect(await idb.getKV('selection')).toEqual([]);
    expect(store.getState().selected.size).toBe(0);
  });

  it('删除谜条时同步清掉其选中状态（选中集不留悬空 id）', async () => {
    const a = mk(); const b = mk();
    await store.addRiddles([a, b]);
    const [ia, ib] = store.getState().riddles.slice(-2).map((r) => r.id);
    store.selectMany([ia, ib], true);
    await store.removeRiddles([ia]);
    expect(store.getState().selected.has(ia)).toBe(false);
    expect(store.getState().selected.has(ib)).toBe(true);
    expect(await idb.getKV('selection')).toEqual([ib]);
    store.clearSelection();
  });
});
