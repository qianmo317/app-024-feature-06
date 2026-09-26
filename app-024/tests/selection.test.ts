// 跨页选择配套：筛选命中说明 matchReasons / hasActiveFilters
import { describe, it, expect } from 'vitest';
import { EMPTY_FILTERS, hasActiveFilters, matchReasons } from '../src/lib/search';
import type { Riddle } from '../src/types';

function riddle(patch: Partial<Riddle>): Riddle {
  return {
    id: 'r1', no: 7, surface: '一口咬掉牛尾巴', answer: '告',
    category: 'char', format: 'none', difficulty: 2, tags: ['儿童专区'],
    author: '张三', source: '民间',
    check: { verdict: 'pass', reasons: [], checkedAt: 0 },
    ...patch,
  };
}

describe('hasActiveFilters', () => {
  it('空筛选为 false', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });
  it('任一条件生效为 true', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: ' 牛 ' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, category: 'char' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, difficulty: 2 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, tag: '儿童专区' })).toBe(true);
  });
});

describe('matchReasons', () => {
  it('无筛选条件时不产生说明', () => {
    expect(matchReasons(riddle({}), EMPTY_FILTERS)).toEqual([]);
  });
  it('列出命中的谜目/难度/校验/标签条件', () => {
    const f = { ...EMPTY_FILTERS, category: 'char' as const, difficulty: 2 as const, verdict: 'pass' as const, tag: '儿童专区' };
    const reasons = matchReasons(riddle({}), f);
    expect(reasons).toContain('谜目「猜一字」');
    expect(reasons).toContain('难度 ★★☆');
    expect(reasons).toContain('校验「通过」');
    expect(reasons).toContain('标签「儿童专区」');
  });
  it('未命中的条件不出现在说明里', () => {
    const f = { ...EMPTY_FILTERS, category: 'idiom' as const, difficulty: 3 as const };
    expect(matchReasons(riddle({}), f)).toEqual([]);
  });
  it('谜格条件命中时给出谜格名', () => {
    const r = riddle({ format: 'juanlian' });
    const reasons = matchReasons(r, { ...EMPTY_FILTERS, format: 'juanlian' });
    expect(reasons).toEqual(['谜格「卷帘格」']);
  });
  it('搜索词说明命中字段（谜面/谜底/谜号/作者/标签）', () => {
    expect(matchReasons(riddle({}), { ...EMPTY_FILTERS, q: '牛尾巴' })).toEqual(['搜索「牛尾巴」命中谜面']);
    expect(matchReasons(riddle({}), { ...EMPTY_FILTERS, q: '告' })).toEqual(['搜索「告」命中谜底']);
    expect(matchReasons(riddle({}), { ...EMPTY_FILTERS, q: '7' })).toEqual(['搜索「7」命中谜号']);
    expect(matchReasons(riddle({}), { ...EMPTY_FILTERS, q: '张三' })).toEqual(['搜索「张三」命中作者']);
    expect(matchReasons(riddle({}), { ...EMPTY_FILTERS, q: '儿童' })).toEqual(['搜索「儿童」命中标签']);
  });
  it('搜索词同时命中多个字段时合并说明', () => {
    const r = riddle({ surface: '告辞', answer: '告' });
    expect(matchReasons(r, { ...EMPTY_FILTERS, q: '告' })).toEqual(['搜索「告」命中谜面、谜底']);
  });
  it('搜索词未命中时不产生搜索说明', () => {
    expect(matchReasons(riddle({}), { ...EMPTY_FILTERS, q: '不存在' })).toEqual([]);
  });
});
