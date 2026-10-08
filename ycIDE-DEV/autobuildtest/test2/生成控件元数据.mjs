/**
 * 生成控件元数据 —— ycIDE 控件元数据速查（供 LLM 提示词使用）
 *
 * 输出两个文件（内容同源，**选一个用，别同时塞进提示词**）：
 *   控件完整元数据.md   编号字典版，体积最小 ← 默认用这个
 *   控件完整元数据.xml  同样内容、XML 结构（层次更清楚，但更大一些）
 *
 * ── 组织方式：编号字典 ─────────────────────────────────────────────
 *   属性 / 方法 / 事件各自编号（前缀 A / M / E），**每条只在字典里定义一次**；
 *   §1 控件索引里只写编号，不再重复定义，也不再需要「适用控件」列。
 *   查法：§1 找控件拿编号 → §2/§3/§4 按编号查定义。
 *   编号按**首次出现顺序**分配 → 同一控件的自有条目编号天然连续 → 可压成闭区间 `A31-A39`。
 *   ⚠️ 区间语义必须在「约定」里写清楚，否则 LLM 读不懂。
 *
 * ── 压缩策略 ──────────────────────────────────────────────────────
 *   1. 编号字典：多个控件共用的条目只写一遍（原来靠「适用控件」列，更贵）。
 *   2. 通用方法先占 M1..M23、通用成员属性只写在「约定」里 —— 索引里不再逐控件重复。
 *   3. 编号区间压缩（连续 ≥3 个才压），并把表格对齐空格去掉（`|a|b|` 是合法 Markdown）。
 *   4. 「专有成员属性」不单独出表 —— 它就是属性表的子集，改为属性名后加 ·读/·写/·读写。
 *   5. 删掉写代码用不到的列：事件消息通道/消息码、控件 Win32 样式串、控件描述（纯复述名字）。
 *   6. 说明文案三档可精简（PROP_DESC / METHOD_DESC / EVENT_DESC：off | restatement | info）。
 *
 * ── 两个易错点（改本脚本前必读）───────────────────────────────────
 *   ★（默认事件）是「控件 × 事件」的属性，**不能进去重键** —— 进去重键会让同名事件
 *     因「是默认/不是默认」裂成两条（如 `内容被改变`）。只标在 §1 索引的编号后。
 *   通用成员属性 = `controlMemberBindings` 里 `unit === '*'` 的 10 个，**不是**「所有控件
 *     的 properties 并集」；且它们只能代码级 `控件名.成员名` 读写，**不能写进 properties{}**。
 *
 * 改完必须跑：node 校验控件元数据.mjs（对账 + ★ 位置 + 编号连续性）
 *
 * 用法：node 生成控件元数据.mjs [PROP_DESC] [METHOD_DESC] [EVENT_DESC] [--repo <IDE源码根>]
 *       node 生成控件元数据.mjs                    # 默认 info info info
 *       node 生成控件元数据.mjs off off off        # 说明文案全保留（体积更大）
 *       node 生成控件元数据.mjs --repo W:/path/to/ycIDE-DEV
 *
 * 路径：本脚本所在目录 = 输出目录；IDE 源码根默认由脚本位置上溯两级推导
 *       （<IDE根>/autobuildtest/test2/生成控件元数据.mjs），也可用 --repo 覆盖。
 *
 * 数据来源：
 *   属性 / 事件 / 成员绑定 → lib/krnln/window-units.json
 *   控件方法（带参数）      → src/renderer/src/components/Editor/editorCoreUtils.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/* ══════════════════════════════ 配置 ══════════════════════════════ */
/** 本脚本所在目录 = 提示词输出目录 */
const DIR = path.dirname(fileURLToPath(import.meta.url))
/** IDE 源码根目录（lib/ 与 src/ 所在处） */
const REPO = (() => {
  const i = process.argv.indexOf('--repo')
  if (i >= 0 && process.argv[i + 1]) return path.resolve(process.argv[i + 1])
  return path.resolve(DIR, '..', '..')
})()
const OUT_MD = path.join(DIR, '控件完整元数据.md')
const OUT_XML = path.join(DIR, '控件完整元数据.xml')

// 说明文案精简档位：off = 原样；restatement = 只删纯复述名字的；info = 只留有额外信息量的
// 取值时跳过 --repo 及其参数，避免把路径当成档位
const positional = process.argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--repo')
const PROP_DESC = positional[0] || 'info'
const METHOD_DESC = positional[1] || 'info'
const EVENT_DESC = positional[2] || 'info'

// 要导出的控件（加控件就往这里加名字，必须与 windowUnits 里的 name 完全一致）
const CONTROLS = ['窗口', '按钮', '标签', '编辑框', '列表框', '组合框', '选择框', '单选框', '图片框', '分组框', '画板', '时钟']

// 元数据里偶尔用别名指代控件（如 选择框 的说明里写「复选框」），归一化时一并替换
const ALIAS = { 选择框: ['选择框', '复选框'] }

/* ══════════════════════════════ 读源数据 ══════════════════════════════ */
const units = JSON.parse(fs.readFileSync(path.join(REPO, 'lib/krnln/window-units.json'), 'utf8'))
let src = fs.readFileSync(path.join(REPO, 'src/renderer/src/components/Editor/editorCoreUtils.ts'), 'utf8').replace(/\r\n/g, '\n')
function grab(startMarker, endMarker) {
  const i = src.indexOf(startMarker)
  const eq = src.indexOf('=', i)
  const lb = src.indexOf('[', eq), lc = src.indexOf('{', eq)
  const isArr = lb >= 0 && (lc < 0 || lb < lc)
  const close = isArr ? ']' : '}'
  const from = isArr ? lb : lc
  const end = src.indexOf(endMarker, from)
  const seg = src.slice(from, end < 0 ? undefined : end)
  return seg.slice(0, seg.lastIndexOf(close) + 1)
}
const WINDOW_OBJECT_METHODS = new Function('return ' + grab('WINDOW_OBJECT_METHODS', '\n\n// 各控件类型专属方法'))()
const CONTROL_TYPE_METHODS = new Function('return ' + grab('CONTROL_TYPE_METHODS', '\n\n// 控件方法命令详情'))()

/* ══════════════════════════════ 小工具 ══════════════════════════════ */
const B = (s) => Buffer.byteLength(String(s == null ? '' : s), 'utf8')
const esc = (s) => String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim()
const xesc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\r?\n/g, ' ').trim()
const defv = (v) => (v === undefined || v === null ? '—' : String(v) === '' ? '""' : String(v))
const rwOf = (b) => (b.get ? '读' : '') + (b.set ? '写' : '')
const paramStr = (m) => (m.params || []).map(p => `${p.name}:${p.type}${p.optional ? '(可省)' : ''}${p.repeatable ? '(可重复)' : ''}`).join(',') || '—'
const argsStr = (e) => (e.args || []).map(a => `${a.name}:${a.dataType}`).join(',') || '—'
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')

// 说明里出现这些 → 认为含有「名字之外的信息」，值得保留
const INFO_RE = /[0-9０-９]|[；;，,、：:]|[（）()「」『』“”"]|仅|只|默认|否则|省略|无效|有效|暂|返回|失败|成功|必须|注意|英文名|生效|相当于|配合|支持|等于|相同|不可|不能|上限|下限|像素|毫秒/
// 这些词删掉后若说明就空了，说明它只是把名字复述了一遍
const STRIP_RE = /本控件|是否|的|了|文本|颜色|字体|图片|底图|标题|内容|数值|项目|显示|指定|表示|用于|使用|中|上|时|个|为|以|和|与|或|其|该|控件|样式|方式|名称|大小|位置|属性/g

function trimDesc(desc, itemName, controlName, mode) {
  const d = String(desc || '')
  if (!d || mode === 'off') return d
  const s = d.replace(/。$/, '')
  if (INFO_RE.test(s)) return d
  if (mode === 'info') return ''
  let rest = s
  if (controlName) rest = rest.replace(rx(controlName), '')
  if (itemName) rest = rest.replace(rx(itemName), '')
  return rest.replace(STRIP_RE, '').length <= 2 ? '' : d
}
const norm = (control, text) => {
  let t = String(text || '')
  for (const a of (ALIAS[control] || [control])) t = t.split(a).join('本控件')
  return t
}
// 多条控件命中同一件但说明文案不同 → 取最短的做底，把别处的「（英文名 xxx）」补上
function mergeDesc(descs) {
  const uniq = [...new Set(descs.filter(Boolean))]
  if (uniq.length <= 1) return uniq[0] || ''
  uniq.sort((a, b) => a.length - b.length)
  const base = uniq[0]
  const extra = []
  for (const d of uniq.slice(1)) for (const m of d.matchAll(/（英文名[^）]*）/g)) if (!base.includes(m[0])) extra.push(m[0])
  if (!extra.length) return base
  return (base.endsWith('。') ? base.slice(0, -1) : base) + extra.join('') + '。'
}
// 编号数组 → A31-A39,A6（连续 ≥3 个才压成区间）
// markId：给该编号加 ★（默认事件）。★ 是「控件 × 事件」的属性，不是事件本身的，
// 所以只能标在索引里，不能写进事件字典 —— 否则同一个事件会因 ★ 不同裂成两条。
function rangeList(ids, markId) {
  if (!ids.length) return '—'
  const prefix = ids[0].slice(0, 1)
  const nums = ids.map(id => Number(id.slice(1))).sort((a, b) => a - b)
  const mark = markId ? Number(markId.slice(1)) : -1
  const out = []
  let i = 0
  while (i < nums.length) {
    if (nums[i] === mark) { out.push(`${prefix}${nums[i]}★`); i++; continue }
    let j = i
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1 && nums[j + 1] !== mark) j++
    if (j - i >= 2) out.push(`${prefix}${nums[i]}-${prefix}${nums[j]}`)
    else for (let k = i; k <= j; k++) out.push(`${prefix}${nums[k]}`)
    i = j + 1
  }
  return out.join(',')
}

/* ══════════════════════════════ 采集 ══════════════════════════════ */
const COMMON_MEMBERS = new Map()
const OWN_MEMBERS = {}
for (const b of (units.controlMemberBindings || [])) {
  if (b.unit === '*') { if (!COMMON_MEMBERS.has(b.member)) COMMON_MEMBERS.set(b.member, rwOf(b)) }
  else { (OWN_MEMBERS[b.unit] ||= new Map()); if (!OWN_MEMBERS[b.unit].has(b.member)) OWN_MEMBERS[b.unit].set(b.member, rwOf(b)) }
}
const memberMark = (name, propName) => {
  const own = OWN_MEMBERS[name]
  if (own && own.has(propName)) return '·' + own.get(propName)
  if (COMMON_MEMBERS.has(propName)) return '·' + COMMON_MEMBERS.get(propName)
  return ''
}
// 通用成员属性的类型：优先从各控件属性表里同名属性取，取不到再用兜底表
const MEMBER_TYPE_FALLBACK = { '标题': '文本型', '内容': '文本型', '文本': '文本型', '标记': '文本型', '可视': '逻辑型', '禁止': '逻辑型', '左边': '整数型', '顶边': '整数型', '宽度': '整数型', '高度': '整数型' }
const MEMBER_TYPE = new Map()
for (const u of (units.windowUnits || [])) for (const p of (u.properties || [])) if (COMMON_MEMBERS.has(p.name) && !MEMBER_TYPE.has(p.name) && p.typeName) MEMBER_TYPE.set(p.name, p.typeName)
for (const k of COMMON_MEMBERS.keys()) if (!MEMBER_TYPE.has(k) && MEMBER_TYPE_FALLBACK[k]) MEMBER_TYPE.set(k, MEMBER_TYPE_FALLBACK[k])

// 通用成员属性 → 「`标题`/`内容`（文本型·读写）、…」，MD 与 XML 共用同一份分组，保证两边说法一致
const MEMBER_GROUPS = (() => {
  const byType = new Map()
  for (const [k, v] of COMMON_MEMBERS) {
    const t = MEMBER_TYPE.get(k) || '—'
    if (!byType.has(t)) byType.set(t, { rw: new Set(), names: [] })
    byType.get(t).rw.add(v)
    byType.get(t).names.push(k)
  }
  return [...byType]
})()
const memberLineMD = MEMBER_GROUPS.map(([t, g]) => `${g.names.map(n => '`' + n + '`').join('/')}（${t}${g.rw.size === 1 ? '·' + [...g.rw][0] : ''}）`).join('、')
const memberLineXML = MEMBER_GROUPS.map(([t, g]) => `${t}(${[...g.rw].join('')}): ${g.names.join('/')}`).join(' | ')

const universalExtra = []
function ownMethods(name) {
  const list = (CONTROL_TYPE_METHODS[name] || []).map(m => ({ name: m.name, ret: m.returnType || '', params: m.params || [], desc: m.description || '' }))
  const known = new Set([...WINDOW_OBJECT_METHODS.map(m => m.name), ...list.map(m => m.name)])
  for (const b of (units.controlMethodBindings || [])) {
    if (known.has(b.member)) continue
    if (b.unit === name) { list.push({ name: b.member, ret: '', params: [], desc: '（无详细签名，参数见支持库绑定）' }); known.add(b.member) }
    else if (b.unit === '*') { if (!universalExtra.includes(b.member)) universalExtra.push(b.member); known.add(b.member) }
  }
  return list
}

const data = CONTROLS.map((name) => {
  const u = units.windowUnits.find(x => x.name === name)
  if (!u) return { name, missing: true }
  const props = (u.properties || []).map(p => {
    const desc = trimDesc(p.description || '', p.name, name, PROP_DESC)
    const nd = norm(name, desc)
    const mark = memberMark(name, p.name)
    return {
      name: p.name, type: p.typeName || '', def: defv(p.defaultValue),
      picks: (p.pickOptions && p.pickOptions.length) ? p.pickOptions.join('/') : '',
      desc, normDesc: nd, mark,
      // 代码可访问性（·读/·写/·读写）不同 → 是不同的东西，不能合并
      key: [p.name, p.typeName, defv(p.defaultValue), (p.pickOptions || []).join('/'), nd, mark].join('¦'),
    }
  })
  const events = (u.events || []).map((e, i) => {
    const desc = trimDesc(e.description || '', e.name, name, EVENT_DESC)
    return {
      name: e.name, args: argsStr(e), desc, normDesc: norm(name, desc),
      // ★（默认事件）不进 key：它是「控件×事件」的属性，进 key 会让同名事件裂成两条
      key: [e.name, JSON.stringify(e.args || [])].join('¦'),
    }
  })
  const methods = ownMethods(name).map(m => {
    const desc = trimDesc(m.desc, m.name, name, METHOD_DESC)
    return { name: m.name, ret: m.ret, params: paramStr(m), desc, normDesc: norm(name, desc), key: [m.name, m.ret, paramStr(m)].join('¦') }
  })
  // 默认事件 = 事件列表第一个（IDE 里新建事件时默认选中的那个）
  return { name, className: u.className || '', props, events, methods, defaultKey: events.length ? events[0].key : null }
})

/* ══════════════════════════════ 建编号字典 ══════════════════════════════ */
const dict = { props: [], methods: [], events: [] }
const idOf = { props: new Map(), methods: new Map(), events: new Map() }
const ctrlIds = {}
const FIELDS = [{ k: 'props', p: 'A' }, { k: 'methods', p: 'M' }, { k: 'events', p: 'E' }]

// ① 通用方法先占 M1..Mn —— 任何控件都能用，控件索引里不再重复列出
for (const m of WINDOW_OBJECT_METHODS) dict.methods.push({ id: 'M' + (dict.methods.length + 1), row: { name: m.name, ret: m.returnType || '', params: paramStr(m), desc: trimDesc(m.description || '', m.name, '', METHOD_DESC) } })
for (const n of universalExtra) dict.methods.push({ id: 'M' + (dict.methods.length + 1), row: { name: n, ret: '—', params: '—', desc: '（无详细签名，参数见支持库绑定）' } })
const UNIVERSAL_METHOD_COUNT = dict.methods.length

// ② 同一条的说明文案先收齐（用于合并「（英文名 xxx）」）
const descPool = { props: new Map(), methods: new Map(), events: new Map() }
for (const d of data) for (const f of FIELDS) for (const r of (d[f.k] || [])) {
  const m = descPool[f.k]
  if (!m.has(r.key)) m.set(r.key, [])
  m.get(r.key).push(r.normDesc || r.desc)
}
// ③ 按「首次出现顺序」编号，同一条复用同一个号
for (const d of data) {
  ctrlIds[d.name] = { props: [], methods: [], events: [] }
  for (const f of FIELDS) {
    for (const r of (d[f.k] || [])) {
      let id = idOf[f.k].get(r.key)
      if (!id) {
        id = f.p + (dict[f.k].length + 1)
        idOf[f.k].set(r.key, id)
        dict[f.k].push({ id, row: { ...r, desc: mergeDesc(descPool[f.k].get(r.key)) } })
      }
      ctrlIds[d.name][f.k].push(id)
    }
  }
}
const reuse = (k) => { const c = new Map(); for (const d of data) for (const id of ctrlIds[d.name][k]) c.set(id, (c.get(id) || 0) + 1); return [...c.values()].filter(n => n > 1).length }
// 每个控件的默认事件编号（渲染索引时标 ★ 用）
for (const d of data) ctrlIds[d.name].defaultEventId = d.defaultKey ? idOf.events.get(d.defaultKey) : null
console.log(`字典条数：属性 ${dict.props.length} / 方法 ${dict.methods.length}（含通用 ${UNIVERSAL_METHOD_COUNT}） / 事件 ${dict.events.length}`)
console.log(`被 ≥2 个控件共用：属性 ${reuse('props')} / 方法 ${reuse('methods')} / 事件 ${reuse('events')}`)

/* ══════════════════════════════ 输出：Markdown ══════════════════════════════ */
const md = []
const W = (s = '') => md.push(s)

W('# ycIDE 控件元数据（编号字典版）')
W()
W('> `生成控件元数据.mjs` 自动导出，勿手工改（控件清单 = 脚本顶部 `CONTROLS`）。')
W('> **读法**：属性/方法/事件各自编号，每条只在字典里定义一次；§1 控件索引里只写编号。')
W('> 想知道某控件有什么 → 看 §1 拿编号 → 去 §2/§3/§4 按编号查定义。')
W()
W('## 约定')
W()
W('- 名称逐字一致（全半角、中英文都区分）；写错 → 编译报错，或事件不触发。')
W('- **属性**：写在 `.efw` 控件 `properties{}` 里；编号后带 `·读写`/`·读`/`·写` 的，还能在 `.eyc` 里用 `控件名.属性名` 访问。')
W('- **方法**：`.eyc` 里写 `控件名.方法(参数…)`；**参数按位置传递，顺序不能换**。`(可省)` 可省略、`(可重复)` 末尾可续接。')
W('- **事件**：`.eyc` 里写子程序 `_控件名_事件名`（**窗口是 `__窗口名_事件名`**，双下划线）。')
W('- **§1 编号读法**：`A31-A39` = A31 到 A39 全部（闭区间）；`,` 分隔不相邻的编号；`—` = 该控件没有这一类专有项（**不是「不能用」**，通用成员属性和 `M1`–`M23` 仍然可用）。')
W('- `★` 标在**该控件的默认事件**编号后（默认事件 = 事件列表第一个，也就是 IDE 里新建事件时默认选中的那个）。')
W(`- **任何控件都能用的成员**（§1 里不再重复列；在 \`.eyc\` 里写 \`控件名.成员名\` 读写，不是 \`properties{}\` 项）：${memberLineMD}；方法 \`M1\`–\`M${UNIVERSAL_METHOD_COUNT}\`。`)
W('- `""` = 空文本，`—` = 无 / 不适用；`本控件` = 该条所属的那个控件。')
W()
W('## 1. 控件索引')
W()
W('|控件|Win32 类|属性|方法|事件|')
W('|---|---|---|---|---|')
for (const d of data) {
  const c = ctrlIds[d.name]
  W(`|${esc(d.name)}|${esc(d.className) || '—'}|${rangeList(c.props)}|${rangeList(c.methods)}|${rangeList(c.events, c.defaultEventId)}|`)
}
W()
W(`## 2. 属性字典（${dict.props.length} 条 · 写在 \`.efw\` 的 \`properties{}\` 里）`)
W()
W('|#|属性名|类型|默认值|可选值|说明|')
W('|---|---|---|---|---|---|')
for (const { id, row } of dict.props) W(`|${id}|${esc(row.name)}${row.mark}|${esc(row.type)}|${esc(row.def)}|${esc(row.picks)}|${esc(row.desc)}|`)
W()
W(`## 3. 方法字典（${dict.methods.length} 条 · \`控件名.方法(参数…)\`）`)
W()
W('|#|方法名|返回|参数|说明|')
W('|---|---|---|---|---|')
for (const { id, row } of dict.methods) W(`|${id}|${esc(row.name)}|${esc(row.ret) || '—'}|${esc(row.params)}|${esc(row.desc)}|`)
W()
W(`## 4. 事件字典（${dict.events.length} 条 · \`_控件名_事件名\`）`)
W()
W('|#|事件名|参数|说明|')
W('|---|---|---|---|')
for (const { id, row } of dict.events) W(`|${id}|${esc(row.name)}|${esc(row.args)}|${esc(row.desc)}|`)
W()

const mdText = md.join('\n') + '\n'
fs.writeFileSync(OUT_MD, mdText, 'utf8')

/* ══════════════════════════════ 输出：XML ══════════════════════════════ */
const x = []
const X = (s = '') => x.push(s)
X('<?xml version="1.0" encoding="utf-8"?>')
X('<!-- ycIDE 控件元数据 · 由 生成控件元数据.mjs 自动导出，勿手工改。')
X('     读法：属性 A / 方法 M / 事件 E 各自编号，每条只定义一次；<ctrl> 里只写编号。')
X('     <ctrl> 的 props/methods/events：`A31-A39` = 闭区间全部；`,` 分隔不相邻的；')
X('       `—` 或空 = 该控件没有这一类专有项（通用成员属性、M1-M23 仍可用）；`★` = 该控件的默认事件（事件列表第一个）。')
X('     属性 p：i=编号 n=名 t=类型 d=默认值 o=可选值 c=说明')
X('     方法 m：i=编号 n=名 r=返回 p=参数 c=说明')
X('     事件 e：i=编号 n=名 p=参数 c=说明')
X('     约定：名称逐字一致；属性写在 .efw 的 properties{}；方法写 控件名.方法(参数…) 且参数按位置传；')
X('           事件写 _控件名_事件名（窗口是 __窗口名_事件名，双下划线）；""=空文本 —=无 本控件=该条所属控件。 -->')
X('<ycide>')
X(' <common>')
X(`  <memberProps>${xesc(memberLineXML)}</memberProps>`)
X(`  <universalMethods ref="M1-M${UNIVERSAL_METHOD_COUNT}">任何控件都能调用</universalMethods>`)
X(' </common>')
X(' <controls>')
for (const d of data) {
  const c = ctrlIds[d.name]
  const a = (k, mark) => (c[k].length ? rangeList(c[k], mark) : '')
  X(`  <ctrl name="${xesc(d.name)}" win32="${xesc(d.className)}" props="${a('props')}" methods="${a('methods')}" events="${a('events', c.defaultEventId)}"/>`)
}
X(' </controls>')
X(' <props>')
for (const { id, row } of dict.props) X(`  <p i="${id}" n="${xesc(row.name)}${xesc(row.mark)}" t="${xesc(row.type)}" d="${xesc(row.def)}"${row.picks ? ` o="${xesc(row.picks)}"` : ''}${row.desc ? ` c="${xesc(row.desc)}"` : ''}/>`)
X(' </props>')
X(' <methods>')
for (const { id, row } of dict.methods) X(`  <m i="${id}" n="${xesc(row.name)}" r="${xesc(row.ret) || '—'}" p="${xesc(row.params)}"${row.desc ? ` c="${xesc(row.desc)}"` : ''}/>`)
X(' </methods>')
X(' <events>')
for (const { id, row } of dict.events) X(`  <e i="${id}" n="${xesc(row.name)}" p="${xesc(row.args)}"${row.desc ? ` c="${xesc(row.desc)}"` : ''}/>`)
X(' </events>')
X('</ycide>')
const xmlText = x.join('\n') + '\n'
fs.writeFileSync(OUT_XML, xmlText, 'utf8')

/* ══════════════════════════════ 诊断 ══════════════════════════════ */
console.log(`档位：PROP_DESC=${PROP_DESC} METHOD_DESC=${METHOD_DESC} EVENT_DESC=${EVENT_DESC}`)
console.log(`MD ：${B(mdText)}B (${(B(mdText) / 1024).toFixed(1)}KB)  ${md.length} 行 → ${OUT_MD}`)
console.log(`XML：${B(xmlText)}B (${(B(xmlText) / 1024).toFixed(1)}KB)  ${x.length} 行 → ${OUT_XML}`)
