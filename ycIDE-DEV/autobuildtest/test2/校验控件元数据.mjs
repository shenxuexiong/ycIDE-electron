/**
 * 校验：控件完整元数据.md（编号字典版）是否「一项不多、一项不少、编号没指错」
 *
 * 做三件事：
 *   1. §2/§3/§4 字典本身：编号连续无重复、无空名
 *   2. §1 索引展开后，逐控件和 window-units.json / editorCoreUtils.ts 对账（属性/方法/事件）
 *   3. ★（默认事件）标的位置 = 该控件在 JSON 里事件列表的第一个
 *
 * 用法：node 校验控件元数据.mjs [--repo <IDE源码根>]
 * 控件清单直接从 生成控件元数据.mjs 里读，两者永远同步。
 * 路径：本脚本所在目录 = 提示词目录；IDE 源码根默认上溯两级推导，也可用 --repo 覆盖。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO = (() => {
  const i = process.argv.indexOf('--repo')
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1])
  return path.resolve(DIR, '..', '..')
})()
const MD = path.join(DIR, '控件完整元数据.md')
const GEN = path.join(DIR, '生成控件元数据.mjs')
const units = JSON.parse(fs.readFileSync(path.join(REPO, 'lib/krnln/window-units.json'), 'utf8'))
let src = fs.readFileSync(path.join(REPO, 'src/renderer/src/components/Editor/editorCoreUtils.ts'), 'utf8').replace(/\r\n/g, '\n')
function grab(a, b) {
  const i = src.indexOf(a), eq = src.indexOf('=', i), lb = src.indexOf('[', eq), lc = src.indexOf('{', eq)
  const isArr = lb >= 0 && (lc < 0 || lb < lc), close = isArr ? ']' : '}', from = isArr ? lb : lc
  const end = src.indexOf(b, from), seg = src.slice(from, end < 0 ? undefined : end)
  return seg.slice(0, seg.lastIndexOf(close) + 1)
}
const WOM = new Function('return ' + grab('WINDOW_OBJECT_METHODS', '\n\n// 各控件类型专属方法'))()
const CTM = new Function('return ' + grab('CONTROL_TYPE_METHODS', '\n\n// 控件方法命令详情'))()
const CONTROLS = new Function('return ' + fs.readFileSync(GEN, 'utf8').match(/const CONTROLS = (\[[^\]]*\])/)[1])()

const cells = (L) => L.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim())
const clean = (s) => s.replace(/^★\s*/, '').replace(/·(读写|读|写)$/, '').trim()
const isDataRow = (L) => /^\|/.test(L) && !/^\|[\s\-|]+\|$/.test(L)

/* ── 1. 解析字典 ───────────────────────────────────────────────── */
const lines = fs.readFileSync(MD, 'utf8').split('\n')
const dict = { props: new Map(), methods: new Map(), events: new Map() }
const idx = []
let sec = null
for (const L of lines) {
  const h = L.match(/^## (\d+)\. (.+)$/)
  if (h) { sec = h[2]; continue }
  if (!isDataRow(L)) continue
  const c = cells(L)
  if (c[0] === '#' || c[0] === '控件') continue   // 表头
  if (sec === '控件索引') { idx.push({ name: c[0], win32: c[1], props: c[2], methods: c[3], events: c[4] }) }
  else if (/^属性字典/.test(sec)) dict.props.set(c[0], clean(c[1]))
  else if (/^方法字典/.test(sec)) dict.methods.set(c[0], clean(c[1]))
  else if (/^事件字典/.test(sec)) dict.events.set(c[0], clean(c[1]))
}

let bad = 0
const fail = (msg) => { bad++; console.log('✗ ' + msg) }

// 字典自身完整性：编号连续（A1..An / M1..Mn / E1..En）、无重复、无空名
for (const [k, p] of [['props', 'A'], ['methods', 'M'], ['events', 'E']]) {
  const m = dict[k]
  const nums = [...m.keys()].map(i => Number(i.slice(1))).sort((a, b) => a - b)
  for (let i = 0; i < nums.length; i++) if (nums[i] !== i + 1) { fail(`${p} 字典编号不连续：第 ${i + 1} 条是 ${p}${nums[i]}`); break }
  for (const [id, name] of m) if (!name) fail(`${p} 字典 ${id} 名字为空`)
}
console.log(`字典：属性 ${dict.props.size} / 方法 ${dict.methods.size} / 事件 ${dict.events.size}`)

/* ── 2. 展开索引里的编号区间 ───────────────────────────────────── */
function expand(spec, kind) {
  const out = []
  for (const tok of spec.split(',')) {
    const t = tok.trim().replace(/★$/, '')
    if (!t || t === '—') continue
    const r = t.match(/^([AME])(\d+)-([AME])(\d+)$/)
    if (r) { for (let i = Number(r[2]); i <= Number(r[4]); i++) out.push(r[1] + i) }
    else out.push(t)
  }
  return out
}
// ★ 所在编号
const starOf = (spec) => { for (const tok of spec.split(',')) { const t = tok.trim(); if (t.endsWith('★')) return t.slice(0, -1) } return null }

const diff = (a, b) => ({ 缺: [...b].filter(x => !a.has(x)), 多: [...a].filter(x => !b.has(x)) })
const report = (label, ctrl, actual, expected) => {
  const d = diff(new Set(actual), new Set(expected))
  const dup = [...new Set(actual.filter((x, i) => actual.indexOf(x) !== i))]
  if (d.缺.length || d.多.length || dup.length) fail(`${ctrl} ${label}：缺[${d.缺}] 多[${d.多}] 重复[${dup}]`)
}

for (const row of idx) {
  const name = row.name
  const u = units.windowUnits.find(x => x.name === name)
  if (!u) { fail(`索引里有控件「${name}」，但 window-units.json 里找不到`); continue }
  const nm = (k, spec) => expand(spec, k).map(id => {
    const v = dict[k].get(id)
    if (v === undefined) fail(`${name} 的 ${k} 引用了不存在的编号 ${id}`)
    return v
  })
  report('属性', name, nm('props', row.props), (u.properties || []).map(p => p.name))
  report('事件', name, nm('events', row.events), (u.events || []).map(e => e.name))

  const ownM = new Set((CTM[name] || []).map(m => m.name))
  for (const b of (units.controlMethodBindings || [])) if (b.unit === name) ownM.add(b.member)
  for (const n of WOM.map(m => m.name)) ownM.delete(n)   // 通用方法不进索引，只在 M1..M23
  report('方法', name, nm('methods', row.methods), [...ownM])

  // ★ 必须落在该控件事件列表的第一个
  const first = (u.events || [])[0]
  const starId = starOf(row.events)
  if (first) {
    const want = dict.events.get(starId)
    if (want !== first.name) fail(`${name} 的 ★ 标在 ${starId}=「${want}」，但事件列表第一个是「${first.name}」`)
  } else if (starId) fail(`${name} 没有事件，却标了 ★`)
}

/* ── 3. 通用方法（M1..M23）应 = WINDOW_OBJECT_METHODS ∪ 通用绑定 ── */
{
  const uni = new Set(WOM.map(m => m.name))
  for (const b of (units.controlMethodBindings || [])) if (b.unit === '*') uni.add(b.member)
  const inDoc = new Set()
  for (const [id, n] of dict.methods) if (Number(id.slice(1)) <= WOM.length) inDoc.add(n)
  const d = diff(inDoc, uni)
  if (d.缺.length || d.多.length) fail(`通用方法区（M1-M${WOM.length}）：缺[${d.缺}] 多[${d.多}]`)
}

const totalP = CONTROLS.reduce((a, c) => a + (units.windowUnits.find(x => x.name === c).properties || []).length, 0)
const totalE = CONTROLS.reduce((a, c) => a + (units.windowUnits.find(x => x.name === c).events || []).length, 0)
console.log(`源：${CONTROLS.length} 个控件共 属性 ${totalP} 项 / 事件 ${totalE} 个`)
console.log(bad === 0 ? '\n✅ 全部一致：编号连续、区间展开正确、★ 位置正确、逐控件与源元数据完全对得上' : `\n❌ ${bad} 处不一致`)
