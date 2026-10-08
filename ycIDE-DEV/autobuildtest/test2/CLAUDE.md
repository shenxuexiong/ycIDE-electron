# ycIDE 项目编辑提示词

> 给 Claude Code / Cursor / Cline 等**外部 AI 编程工具**用的提示词。
> 目的：不打开 ycIDE IDE 的情况下，也能正确读写、编译、运行 ycIDE 项目。
> **只写 ycIDE 特有的、容易踩错的知识**；通用编程常识一律不写。
>
> 配套文档（同目录，改界面/控件时**随提示词一起喂给 LLM**）：
> - **`控件完整元数据.md`** —— 12 个常用控件的**全部属性 / 全部方法 / 全部事件**（支持库自动导出，写代码/改控件时最权威）
>   - 结构：§1 控件索引（控件 → 编号）→ §2/§3/§4 属性/方法/事件字典（按编号查定义）。**编号区间 `A31-A39` 是闭区间**。
>   - 由 `生成控件元数据.mjs` 生成，`校验控件元数据.mjs` 可回归对账；要加控件改脚本顶部 `CONTROLS` 再重跑。
>
> **ycIDE 源码根目录（固定不变，本文档所有「查源码」都以它为准）**：
> `W:\OpenClaw\ycIDE-electron\ycIDE-DEV`
> 查不到的控件 / 命令 / 常量 / 方法，都按 **第 11 节「信息查找手册」** 的命令去源码里查。
>
> ⚠️ **别找错目录**：`W:\OpenClaw\ycIDE-electron`（上一级）是作者**两个月前的旧版本**，
> 目录结构相似但已过时（行号、行为都对不上）。**一律以 `ycIDE-DEV` 为准。**

---

## 0. 背景（一句话）

ycIDE 是「易承语言」（易语言方言）的 IDE。**源码是纯文本易语言**，可直接用文本工具读写。
编译链路：`.eyc` → 转译为 C++ → 交给内置 Zig/clang 编译成 exe。

---

## 1. 目录速查：按扩展名认文件

第一次 `dir` / `ls` 一个 ycIDE 项目时，看到的就是下面这些。
**先认扩展名，再决定读哪个文件**：

| 扩展名 / 条目 | 是什么 | 处理方式 |
|---|---|---|
| `.epp` | **项目主文件**（INI 式）。决定项目包含哪些文件、编译成什么类型 | **必读，先读它** |
| `.eyc` | **源码**（一个文件 = 一个程序集）。易语言纯文本，业务逻辑都在这 | **主要工作对象** |
| `.ecc` | **类模块源码**（面向对象）。在 `.epp` 里同为 `EYC` 类型，但编译器按「类」处理（收集类名 + 成员变量） | **要读** |
| `.efw` | **窗口定义**（JSON）。窗口尺寸、标题、控件列表 | 改界面时必读 |
| `.egv` | **全局变量**声明 | 按需 |
| `.ecs` | **常量**声明 | 按需 |
| `.edt` | **自定义数据类型**声明 | 按需 |
| `.ell` | **DLL 命令**声明（外部 API 绑定） | 按需 |
| `.erc` | **资源**（图片 / 声音等引用） | 按需 |
| `.e` | **老版易语言工程文件**。**仅用于导入**，不是本 IDE 的原生格式 | 跳过 |
| `.ec` | **老版易语言模块文件**。同上，仅用于导入 | 跳过 |
| `.ycide-session.json` | IDE 会话状态，含**本机绝对路径** | 跳过，且不要提交 |
| `.ycide-ai-chat.json` | IDE 内置 AI 助手的对话历史 | 跳过，且不要提交 |
| `output/` | 编译产物目录（`.exe` / `.dll` / `.pdb`） | 产物，不读不改 |
| `temp/` | 转译中间产物 + 缓存（生成的 `.cpp`、编译诊断日志） | 产物，不读不改 |
| `logs/` | 运行日志 | 按需 |
| `.exe` / `.dll` / `.pdb` / `.o` | 编译产物（二进制） | 不要编辑 |

> 一句话记忆：**`.epp` 是目录，`.eyc`/`.ecc` 是逻辑，`.efw` 是界面，其余 `.e??` 是声明表，`output/`+`temp/`+`logs/` 全是产物。**

---

## 2. 项目组织形式

**一个目录 = 一个项目**，项目主文件是 `<项目名>.epp`。

```
<项目名>/
├── <项目名>.epp          # 项目主文件（INI 式），必须存在
├── _启动窗口.efw          # 窗口定义（JSON）
├── _启动窗口.eyc          # 源码（易语言纯文本）
├── .ycide-session.json   # IDE 会话状态（含本机绝对路径）
├── .ycide-ai-chat.json   # IDE 内置 AI 助手的对话历史
├── output/               # 编译产物（exe / pdb）
├── temp/                 # 转译中间产物 + 缓存
└── logs/
```

### 2.1 `.epp` 格式

```ini
# YiCode Project File
Version=1
ProjectName=windows窗口程序-新项目1
OutputType=WindowsApp
Platform=windows

File=EFW|_启动窗口.efw|1
File=EYC|_启动窗口.eyc|0
```

- `OutputType`：`WindowsApp`（窗口程序）/ `Console`（控制台）/ `DynamicLibrary`（DLL）
- `File=<TYPE>|<文件名>|<flag>` —— `flag=1` 表示**启动文件**（每个项目恰好一个）
- `TYPE` 与扩展名一一对应：

  | TYPE | 扩展名 | 内容 |
  |---|---|---|
  | EYC | `.eyc` / `.ecc` | 源码（`.eyc` 普通程序集，`.ecc` 类模块） |
  | EFW | `.efw` | 窗口定义（JSON） |
  | EGV | `.egv` | 全局变量 |
  | ECS | `.ecs` | 常量 |
  | EDT | `.edt` | 自定义数据类型 |
  | ELL | `.ell` | DLL 命令声明 |
  | ERC | `.erc` | 资源 |

> ⚠️ **头号坑：新增或删除源文件后，必须同步改 `.epp` 的 `File=` 列表。**
> 只把文件丢进目录是不会被编译的——IDE 和编译器都只认 `.epp` 里登记过的文件。

---

## 3. 源文件书写规则

### 3.1 `.eyc` / `.ecc`（源码）

- **无 BOM、UTF-8、LF 行尾、不含零宽字符**
- 开头固定两行：`.版本 2` 然后 `.程序集 <程序集名>`
- 子程序声明：`.子程序 <名字>, <返回类型>, <公开|空>, <注释>`
  - 例：`.子程序 子程序1, 文本型, 公开`
  - 返回类型留空表示无返回值
- **流程控制关键字必须带 `.` 前缀**，缩进 **4 个空格 / 级**：

  ```
  .如果 (条件)
      语句
  .否则
      语句
  .如果结束
  ```

- 常用点号指令：`.计次循环首` / `.计次循环尾`、`.判断开始` / `.判断` / `.判断结束`、
  `.变量循环首` / `.变量循环尾`、`.返回(值)`、`.结束()`
- 子程序之间**没有显式结束标记**——靠下一个 `.子程序` 或文件末尾界定
- 观察到的两种收尾写法：`.返回(值)` 从子程序返回；`.结束()` 结束程序

### 3.2 `.efw`（窗口定义）

JSON，结构如下（字段缺失有默认值，解析器容错很好）：

```json
{
  "type": "window",
  "name": "_启动窗口",
  "title": "窗口标题",
  "width": 592,
  "height": 384,
  "sourceFile": "_启动窗口.eyc",
  "controls": [
    {
      "id": "按钮1", "type": "按钮", "name": "按钮1",
      "left": 24, "top": 16, "width": 80, "height": 24,
      "text": "确定", "visible": true, "enabled": true,
      "properties": {}
    }
  ]
}
```

- `sourceFile` 必须指向同目录的 `.eyc`（窗口逻辑写在那里）
- 控件的 `type`（如 `按钮`）是**支持库组件名**，写错编译期会报错
- 坐标单位与 `width`/`height` 同为像素，原点在窗口客户区左上角
- 可选字段：`menu`（菜单树）、`properties`（窗口属性）
- 每个控件的**通用字段**固定为：`id` / `type` / `name` / `left` / `top` / `width` / `height` / `text` / `visible` / `enabled` / `properties{}`
- 「多项」属性（`列表项目` / `子夹标题`）是**文本型，用 `\n` 分隔**：`"列表项目": "项目1\n项目2\n项目3"`

### 3.3 常用控件 + 事件命名规则（改界面前必读）

**常用控件（type 名，写错编译报错）**：`窗口` / `按钮` / `标签` / `编辑框` / `列表框` / `组合框` / `选择框` / `单选框` / `图片框` / `分组框` / `画板` / `时钟`。
**每个控件的全部属性 / 全部方法 / 全部事件** → 见同目录 **`控件完整元数据.md`**（支持库自动导出，权威；§1 索引拿编号 → §2/§3/§4 查定义）。
（原始数据源是 `lib/krnln/window-units.json` + `src/renderer/src/components/Editor/editorCoreUtils.ts`。）

**事件子程序命名规则（AI 最容易写错的地方）**：

| 场景 | 规则 | 例子 |
|---|---|---|
| 控件事件 | `_` + 控件名(去前导下划线) + `_` + 事件名 | `按钮1` 的 `被单击` → **`_按钮1_被单击`** |
| 窗口事件 | `_` + 窗口原始名 + `_` + 事件名 | `_启动窗口` 的 `创建完毕` → **`__启动窗口_创建完毕`**（双下划线） |
| 菜单项事件 | `_` + 菜单项名(去前导下划线) + `_被选择` | 菜单项 `打开` → **`_打开_被选择`** |

- **默认事件 = 控件事件列表的第一个**（双击设计器控件生成的就是它）：按钮/标签/选择框/单选框 → `被单击`；编辑框 → `内容被改变`；列表框/组合框 → `选择项被改变`；图片框 → `鼠标左键被按下`；窗口 → `创建完毕`
- 带参数的事件（如 `鼠标左键被按下(横向位置, 纵向位置, 功能键状态)`、窗口 `按下某键(键代码, 功能键状态)`）声明子程序时必须**按顺序、按类型列全参数**
- 事件子程序由用户 `.eyc` 提供实现；无实现时编译器生成**弱空实现**（`WEAK_FUNC`）保证能链接

---

## 4. 编码与行尾（外部工具最容易搞坏的地方）

| 项 | 要求 |
|---|---|
| 字符集 | **UTF-8**（编译器读源码固定按 UTF-8 解码） |
| BOM | **不要加 BOM** |
| 行尾 | **LF**（现有文件实测全部是 LF，不是 CRLF） |
| 零宽字符 | **不要引入** 200C / 200D / 2060 —— 那是 IDE 编辑器内部的流程标记，磁盘文件里不该有 |

> 用 git 管理时务必用 `.gitattributes` 锁死行尾（见 6.1 节），
> 否则 Windows 上 `core.autocrlf` 会把 LF 改成 CRLF。

---

## 5. 编译与运行

### 5.1 编译方式

**AI / 自动化请直接调 CLI**（无 `pause` 阻塞、无代码页乱码，最省事）：

```bash
node W:/OpenClaw/ycIDE-electron/ycIDE-DEV/out/main/cli.js build "<项目目录或父目录>" [参数]
```

- `out/main/cli.js` 由 `npm run build` 生成；若不存在先跑一次（首次较慢）
- 传**父目录**会**递归扫描其中所有 `.epp`（默认深度 8）并逐个编译**，
  所以**一次可以把多个项目一起编译**（单项目目录、多项目父目录、嵌套根目录都行）
- 前置依赖：Zig 工具链需放在 `W:/OpenClaw/ycIDE-electron/ycIDE-DEV/compiler/zig/zig.exe`
- **打包后的 IDE 本体也支持**：`ycIDE.exe --autobuild "<目录>" [参数]`
  （输出以日志文件兜底，因为 Windows 上 Electron 属 GUI 子系统，stdout 可能不可见）

**给人用的一键 `.bat`**（都在 `ycIDE-DEV/` 根目录，双击即可；结尾有 `pause`，
且会在 `cli.js` 缺失或比 `src/main/*.ts` 旧时自动 `npm run build`）：

| 脚本 | 作用 |
|---|---|
| `run.bat` | 打开 IDE（dev 模式）。顺带检查 Node ≥ 22 / `node_modules` / Electron 二进制（缺失自动走 npmmirror 补装）/ Zig 工具链 |
| `autobuildtest.bat` | 固定编译 `autobuildtest/`（含 `test1` 的 4 个示例项目），默认等价于 `--run`；日志落 `debug_logs/autobuildtest.log` |
| `autobuild.bat` | 通用版：把**任意目录**拖到它上面，或双击后输入路径；其余参数原样透传给 CLI |

> `.bat` 内部**只用 ASCII**（cmd.exe 按本机 OEM 代码页解析 `.bat`，写 UTF-8 中文会乱码）。
> 工具自身的中文输出来自 node，不受影响；若真看到乱码，先在控制台执行 `chcp 65001`。

### 5.2 常用参数

| 参数 | 作用 |
|---|---|
| `--run` / `-r` | 编译成功后自动运行产物并回显输出 |
| `--list` / `--dry-run` | 只列出扫描到的项目，不编译 |
| `--debug` | 带调试运行时编译（开启行级跟踪输出） |
| `--json` | 以 JSON 输出最终摘要（便于脚本消费） |
| `--log <文件>` | 完整输出额外写入该文件 |
| `--run-timeout <毫秒>` | 运行超时；控制台默认不超时，GUI 默认 15000 |
| `--encoding <名称>` | **兼容保留参数**：输出解码固定按 UTF-8（IDE 生成的程序已 `SetConsoleOutputCP(65001)`），该参数不再实际生效 |
| `--arch <x86\|x64\|arm64>` | 覆盖目标架构 |
| `--fail-fast` | 任一项目失败即停止 |
| `--watchdog <分钟>` | 强制结束自身时限（默认 10，防 GUI 卡死挂住整条流程；`0` 关闭） |

**退出码**：`0` 全部成功 / `1` 有失败 / `2` 用法错误或未找到项目 / `124` 看门狗超时

### 5.3 运行产物的实际行为（实测结论）

| 项目类型 | `--run` 行为 |
|---|---|
| `Console` | 跑到程序自己退出，捕获全部 stdout / stderr |
| `WindowsApp` | 能捕获 `调试输出`；程序若自身不退出，超时后被结束（**退出码 124 是正常的**，不算失败） |
| `DynamicLibrary` | **跳过运行**并打印一行说明（「输出类型为 DynamicLibrary（动态链接库），不是可执行程序，无法直接运行」）。编译本身仍算成功，**不会报错、不会拖垮整批**。要验证 DLL 得另写宿主程序调用它 |

**关于 `调试输出`**：
- 输出会带一个 `* ` 前缀（这是调试行标记，不是你文本的一部分）：
  ```
  * "good,调试输出成功!我运行成功了!!!"
  ```
- **窗口程序（GUI）的 `调试输出` 同样能被 CLI 捕获** —— 子进程 stdout 被重定向到管道，
  与有没有控制台窗口无关。所以**窗口程序唯一的自动化观测手段就是在代码里埋 `调试输出`**

**退出码 124 的触发条件**：仅当程序自身不退出（卡在消息循环）时才会被超时结束并返回 124。
若代码里主动调用了 `.结束()`，程序正常退出，退出码是 `0`。

**编译耗时**：首次需真正转译 + 链接，明显更慢（实测约 17~18 秒）；命中缓存后约 30~300 毫秒。

**支持库**：编译时自动加载仓库内置的支持库编译协议（`window-units.json` 等），
一般不需要 `--user-data`；只有用到自定义/第三方支持库时才需要指定。

### 5.4 编译诊断怎么读（重点）

编译错误**已经回映射到易语言源码**，可直接定位，形如：

```
错误: _启动窗口.eyc 第 42 行
  42 |  变量 = "文本" + 1
  ↳ 这一行运算符两边的类型不能这样运算（比如拿文本去做减法）。
  ↳ 请先检查这一行的类型用得对不对；确认没问题的话就是 ycIDE 的问题，请反馈。
```

四段信息：**文件名 + 行号 + 源码原文 + 人话解释 + 归责**。

- 最后一行是「归责」：告诉你该改自己的代码，还是这是 ycIDE 编译器的问题（后者不要去改源码，应绕开或反馈）
- 当编译器认不出某条错误时，会直接甩 clang 的英文原文，并在提示里说明"ycIDE 还没认识这条错误"

---

## 6. 构建产物（不要提交进 git）

```
output/              # 编译产物：<项目名>.exe / .dll / .pdb
temp/                # 转译中间产物：生成的 .cpp、资源 .o、缓存、编译诊断日志
logs/                # 运行日志
.ycide-session.json  # IDE 会话状态，含本机绝对路径，换机器就失效
.ycide-ai-chat.json  # IDE 内置 AI 助手的对话历史
```

`temp/` 里值得知道的东西：
- `temp/<源码名>.cpp` —— 每个 `.eyc` / `.ecc` 转译出的 C++（文件名与源文件同名）
- `temp/main.cpp` —— 生成的入口
- `temp/编译诊断日志.log` —— 完整编译诊断

### 6.1 推荐的 `.gitignore` / `.gitattributes`（可直接复制到项目根）

`.gitignore`：

```gitignore
output/
temp/
logs/
.ycide-session.json
.ycide-ai-chat.json
Thumbs.db
desktop.ini
```

`.gitattributes`（**必须**，否则 Windows 上 `core.autocrlf` 会把 LF 改成 CRLF，污染全部 diff）：

```gitattributes
* text=auto eol=lf

*.eyc text eol=lf
*.ecc text eol=lf
*.egv text eol=lf
*.ecs text eol=lf
*.edt text eol=lf
*.ell text eol=lf
*.erc text eol=lf
*.efw text eol=lf
*.epp text eol=lf

*.exe binary
*.pdb binary
*.o   binary
```

---

## 7. 缓存机制

- `temp/.transpile-cache.json`、`temp/.build-artifact-cache.json` 是转译 / 构建缓存
- 缓存键包含**文件大小 + 修改时间**，所以外部改文件后**会自动失效**，正常无需手动清理
- 命中缓存时终端会打印：
  ```
  复用已转换文件: <源码名>.cpp
  未检测到编译输入变化，跳过编译与链接，直接复用上次产物。
  ```
- 若出现「明明改了却没生效」的疑似缓存问题，删掉这两个 json 强制重编

---

## 8. 已知限制（设计边界，不是 bug）

- **GUI 的视觉结果无法自动验证**：能拿到 `调试输出` 的文本，但**看不到窗口实际长相、
  控件位置、布局是否重叠**。窗口对不对只能靠人看，或让程序自己截图
- **DLL 项目不能被 `--run` 运行**（见 5.3），只能编译；CLI 会明确跳过并说明
- 没有语言服务器（LSP），外部工具拿不到符号级补全 / 跳转，只能靠读文件

---

## 9. 编辑前自检清单

改完代码，提交前过一遍：

- [ ] 新增/删除的文件，`.epp` 的 `File=` 列表同步了吗？
- [ ] 改了窗口/控件：`.efw` 里的 `type` 是**支持库控件名**吗？新增控件后 `.eyc` 里有对应事件子程序吗？
- [ ] 事件子程序名拼对了吗（`_控件名_事件名`）？带参数的事件参数列全了吗？
- [ ] 流程控制关键字带 `.` 前缀了吗？缩进是 4 空格 / 级吗？
- [ ] 文件是 UTF-8 无 BOM、LF 行尾吗？没混进零宽字符吧？
- [ ] 跑一次 `cli.js build <项目> --run` 了吗？编译错误都清掉了吗？
- [ ] `output/`、`temp/`、`logs/`、`.ycide-*.json` 没被提交吧？

---

## 10. 已验证的命令示例

以下命令在 Windows + 本仓库环境下实测通过。
**`<仓库>` = `W:\OpenClaw\ycIDE-electron\ycIDE-DEV`（ycIDE 源码根目录，固定不变，可直接写死绝对路径）**：

```bash
# 只列出某目录下所有 ycIDE 项目，不编译（递归扫描 .epp）
node <仓库>/out/main/cli.js build "<父目录>" --list

# 编译单个项目并运行（控制台程序最合适）
node <仓库>/out/main/cli.js build "<项目目录>" --run

# 编译 + 运行 + 机器可读摘要 + 完整日志落盘
node <仓库>/out/main/cli.js build "<项目目录>" --run --json --log "<日志文件>"

# 批量：编译一个目录下全部项目（含嵌套）
node <仓库>/out/main/cli.js build "<父目录>" --run

# DLL 项目（--run 会被自动跳过，加不加都行）
node <仓库>/out/main/cli.js build "<项目目录>"
```

实测输出片段（控制台项目）：

```
[成功] 编译成功 (17954 毫秒/17.9 秒)
输出文件: .../output/windows/x64/新项目test3控制台程序测试.exe
编译结果: 成功
错误 0 个 / 警告 0 个 / 耗时 17955ms
------------------------------------------
正在运行程序: .
------------------------------------------
[成功] 程序已启动 (PID: 7712)
* "我是控制台程序3,test3    ok!!!"
[成功] 程序已退出 (退出码: 0)
```

---

## 11. 信息查找手册（不常用控件 / 命令 / 常量 / 方法，都在这查）

**ycIDE 源码根目录固定不变**：`W:\OpenClaw\ycIDE-electron\ycIDE-DEV`
下面命令里的 `W:/OpenClaw/ycIDE-electron/ycIDE-DEV` 就是这个根目录（正斜杠在 node 里等价）。**凡是文档没写到的控件/命令/常量，都按这里的命令去源码里查，不要凭空猜。**

### 11.1 数据文件索引（先认文件，再查内容）

所有控件/命令/常量元数据都在 `<仓库>/lib/<库名>/` 下（`<库名>` = `krnln` 核心库 / `script` / `webview2`）：

| 文件 | 装什么 | 关键字段 |
|---|---|---|
| `lib/krnln/window-units.json` | **窗口控件 + 事件 + 代码生成映射** | 见 11.2 |
| `lib/krnln/krnln.commands.ycmd.json` | **命令（方法）契约**（514 个） | `commandId` / `displayName` / `summary` / `params[]` / `returnType` / `category` |
| `lib/krnln/krnln.constants.json` | **常量**（337 个） | `name`（如 `#备注型`）/ `value` / `type` / `description` |
| `lib/krnln/krnln.library.json` | 支持库标识（作者/版本/主页） | `guid` / `description` / `author` / `homePage` |
| `lib/krnln/generated/command-mapping.windows.json` | 命令 → 本地符号映射（514） | `commandId` / `nativeSymbol` / `abiRisk` / `implemented` |
| `lib/krnln/impl/windows.cpp` | 命令的 Windows 平台实现（C++） | 命令到底怎么实现的 |
| `lib/krnln/核心常量表.txt` / `系统核心支持库帮助说明文件.txt` | 易语言官方帮助文本 | 人话说明 |

> `window-units.json` 的**顶层结构**（不是数组！）：
> `version` / `description` / `author` / **`windowUnits[]`（46 控件）** / **`commandBindings[]`（57 命令→C++模板）** / **`controlMethodBindings[]`（70 控件方法）** / **`controlMemberBindings[]`（75 控件成员属性）**。
> 库的目录约定见 `lib/krnln/README.md`。

### 11.2 一行命令查信息（实测可用）

**① 列出全部控件名**（想知道有什么控件）：
```bash
node -e "require('W:/OpenClaw/ycIDE-electron/ycIDE-DEV/lib/krnln/window-units.json').windowUnits.forEach((u,i)=>console.log((i+1)+'. '+u.name+' ('+u.englishName+') - '+u.description))"
```

**② 查某个控件的全部信息**（属性 + 事件 + Win32 类名/样式）：
```bash
node -e "console.log(JSON.stringify(require('W:/OpenClaw/ycIDE-electron/ycIDE-DEV/lib/krnln/window-units.json').windowUnits.find(u=>u.name==='选择夹'),null,2))"
```
> 每个控件含：`name` / `englishName` / `description` / `className`(Win32 类名) / `style`(Win32 样式) /
> `properties[]`（每项：`name` / `englishName` / `typeName` / `defaultValue` / `pickOptions` / `description`）/
> `events[]`（每项：`name` / `description` / `args[]` / `channel`(消息) / `code`(通知码)）。

**③ 按关键字搜控件**（如所有带「框」的）：
```bash
node -e "require('W:/OpenClaw/ycIDE-electron/ycIDE-DEV/lib/krnln/window-units.json').windowUnits.filter(u=>u.name.includes('框')).forEach(u=>console.log(u.name+' - '+u.description))"
```

**④ 查某控件在代码里能调的方法 / 能读写的成员属性**（见 11.3 详解）：
```bash
node -e "const j=require('W:/OpenClaw/ycIDE-electron/ycIDE-DEV/lib/krnln/window-units.json'); const n='列表框'; j.controlMethodBindings.filter(b=>b.unit===n||b.unit==='*').forEach(b=>console.log(n+'1.'+b.member+'()')); j.controlMemberBindings.filter(b=>b.unit===n||b.unit==='*').forEach(b=>console.log(n+'1.'+b.member))"
```

**⑤ 查命令（方法）**（如所有含「文件」的命令，含参数与返回类型）：
```bash
node -e "require('W:/OpenClaw/ycIDE-electron/ycIDE-DEV/lib/krnln/krnln.commands.ycmd.json').commands.filter(c=>c.displayName.includes('文件')).forEach(c=>console.log(c.displayName+'  →  '+c.summary))"
```

**⑥ 查常量**（常量名都带 `#` 前缀，如 `#红色` / `#白色`；下面查所有含「色」的）：
```bash
node -e "require('W:/OpenClaw/ycIDE-electron/ycIDE-DEV/lib/krnln/krnln.constants.json').constants.filter(c=>c.name.includes('色')).forEach(c=>console.log(c.name+' = '+c.value))"
```

**⑦ 直接用文本搜索源码**（不知道在哪个文件时，用 grep 类工具搜）：
```bash
# 在源码里搜任意关键字（控件名 / 属性名 / 事件名 / 报错文本）
# 例：搜「选择夹」在哪些源码里被处理
```

### 11.3 控件在代码里能调什么（方法 / 成员属性）

写窗口逻辑时，除了「属性面板」里的设计期属性，控件在**代码里**还能调**方法**、读写**成员属性**。这两张表在 `window-units.json` 里：

- **`controlMethodBindings[]`**：`unit`（哪个控件，`*` = 所有控件通用） / `member`（方法名） / `call`（生成的 C++ 代码）
- **`controlMemberBindings[]`**：`unit` / `member`（成员名） / `get` / `set`（读写生成的 C++）

**所有控件通用方法（`unit="*"` 的 16 个；连同编辑器通用方法共 `M1`–`M23`）**：
`移动` / `取窗口句柄` / `获取焦点` / `可有焦点` / `取用户区宽度` / `取用户区高度` /
`禁止重画` / `允许重画` / `重画` / `部分重画` / `取消重画` / `刷新显示` / `调整层次` / `发送信息` / `投递信息` / `激活`

**所有控件通用成员属性（`unit="*"`）**：
`标题` / `内容` / `文本` / `标记` / `可视` / `禁止` / `左边` / `顶边` / `宽度` / `高度`

**控件专有方法 / 成员（节选，完整用 11.2 ④ 命令查）**：

| 控件 | 专有方法 | 专有成员属性 |
|---|---|---|
| `窗口` | `销毁` / `载入` | — |
| `列表框` | `加入项目` / `插入项目` / `删除项目` / `清空` / `取项目数` / `取项目文本` / `置项目文本` / `取项目数值` / `置项目数值` / `取顶端可见项目` / `置顶端可见项目` / `取已选择项目数` / `取所有被选择项目` / `取焦点项目` / `置焦点项目` / `是否被选择` / `选择` / `选择项目` | `现行选中项` / `列表项目` / `文本颜色` |
| `组合框` | `加入项目` / `插入项目` / `删除项目` / `清空` / `取项目数` / `取项目文本` / `置项目文本` / `取项目数值` / `置项目数值` / `取顶端可见项目` / `置顶端可见项目` / `选择` | `现行选中项` / `列表项目` / `起始选择位置` / `被选择字符数` / `最大文本长度` / `被选择文本` / `文本颜色` |
| `编辑框` | `加入文本` | `起始选择位置` / `被选择字符数` / `最大允许长度` / `被选择文本` / `文本颜色` |
| `选择框` / `单选框` | — | `选中` / `文本颜色` |
| `进度条` | — | `位置` / `最小位置` / `最大位置` |
| `滑块条` | — | `位置` / `最小位置` / `最大位置` / `页改变值` / `行改变值` |
| `选择夹` | `取子夹数目` / `取子夹名称` / `置子夹名称` | `现行子夹` |
| `时钟` | — | `时钟周期` |
| `标签` / `分组框` | — | `文本颜色` |
| `通用对话框` | `打开` | — |
| `图形按钮` | — | `选中` |

> 写法：方法带括号 `列表框1.加入项目("x")`，成员属性直接读写 `按钮1.标题 ＝ "确定"` / `编辑框1.内容 ＝ "abc"`。
> `commandBindings[]`（57 个）是「命令」而非控件方法，如 `信息框` / `调试输出` / `标准输出` / `取当前目录` / `读入文件` 等，用法见 ⑤。

### 11.4 IDE 行为源码位置索引（想知道 IDE 为什么这么干时）

源码根：`W:\OpenClaw\ycIDE-electron\ycIDE-DEV\src`

| 想查什么 | 看哪个文件 |
|---|---|
| 工具箱控件列表怎么来的 | `renderer/src/components/Editor/VisualDesigner.tsx:2378` `toolboxItems`（由 `windowUnits` 渲染；空则提示「请先加载支持库」） |
| **事件子程序名怎么拼** | `renderer/src/components/Editor/Editor.tsx:657` `buildEventSubName` = `` `_${名去前导下划线}_${事件名}` `` |
| 默认事件怎么定 | `renderer/src/components/Editor/VisualDesigner.tsx:1509` `unitInfo?.events?.[0]`（= 事件列表第一个） |
| `.efw` 控件结构定义 | `renderer/src/components/Editor/VisualDesigner.tsx:48` `DesignControl` / `:76` `DesignForm` |
| `.epp` 解析 | `src/main/compiler.ts:930` `parseEppFile`（`File=<TYPE>|<文件名>|<flag>`，flag=1 启动文件） |
| 编译错误怎么回映射到易语言行 | `src/main/compiler.ts:663` `reportFriendlyCppDiagnostic`（`/*@<eyc行号>*/` 标记） |
| `调试输出` 怎么落 stdout | `src/main/compiler.ts:6337` `yc_debug_output_value` |
| 命令/常量元数据怎么加载 | `src/main/libraryManager.ts`；命令映射 `src/main/eproject/libCommandMaps.ts` |
| 命令行编译入口 | `src/main/autoBuild.ts`（`out/main/cli.js` 的实现）；独立入口 `src/main/cli.ts` |
| 一键 `.bat`（给人双击用） | `run.bat` / `autobuildtest.bat` / `autobuild.bat`（均在仓库根，见 5.1） |
| 编译跑在工作线程里（不卡界面） | `src/main/compileWorkerClient.ts`（worker 失败会自动回退主进程编译） |
| 运行产物 / 调试运行时 | `src/main/compiler.ts` `runExecutable` / `stopExecutable`（`.ycdbg_cmd` 协议） |

> 查法：直接在 `<仓库>\src` 下用 grep 搜控件名 / 属性名 / 事件名 / 报错中文文本即可定位。
> 例：搜 `选择夹` → 命中 `VisualDesigner.tsx` 的渲染分支；搜 `spawn EFTYPE` → 命中运行逻辑。

**产物路径规律**：`output/<平台>/<架构>/<项目名>.exe | .dll`
（本机实测为 `output/windows/x64/`）
