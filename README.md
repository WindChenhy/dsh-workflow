# DSH Workflow Orchestrator (L5)

将原 React 工作流编排器改造为 **DeepSeek Harness 0.2.x 的 L5 单插件**（Cordis bundle）。
保留可视化编辑器，同时把工作流定义、校验与执行能力提升到宿主侧，以 `ctx.workflow` 服务和一组 `workflow.*` 工具暴露给模型和其它插件。

## 架构

```
src/
├── core/          纯 TypeScript，零 DOM / 零 Node 依赖，Web 与插件共享
│   ├── types.ts       数据模型（enum 改为 const object，兼容 erasableSyntaxOnly）
│   ├── variables.ts   安全的变量引用解析（无 eval）
│   ├── yaml.ts        零依赖 YAML 序列化 / 严格校验
│   ├── graph.ts       拓扑排序、环检测、分支 handle 语义
│   ├── validator.ts   统一工作流校验
│   └── engine.ts      确定性执行引擎（可注入 handler / fetch / 沙箱）
├── plugin/        DSH 宿主侧 L5 插件
│   ├── index.ts       函数式入口：name / inject / Config / apply
│   ├── config.ts      Schemastery 配置 schema（默认值在此，加载时强校验）
│   ├── events.ts      Context/Events 声明合并（类型安全）
│   ├── service.ts     class form 服务 `ctx.workflow`
│   └── tools.ts       defineTool 工具集
├── web 部分       components/ nodes/ store/ hooks/ utils/ App.tsx
├── __tests__/     原 55 项 store 测试 + core / plugin 新测试
├── cordis.patch.yml          bundle 贡献的配置层
└── vite.plugin.config.ts     Node 侧 ESM bundle 构建
```

三层依赖方向严格单向：`web → core`，`plugin → core`，`core` 不依赖任何运行时。

## 安装到 DeepSeek Harness

目标版本：官方 `dsh-v0.2.2-rc.3`（声明兼容 `>=0.2.0-0 <0.3.0`）。

```bash
# 构建（会同时产出 dist-plugin 与 dist）
npm install
npm run build

# 安装到某个 profile
dsh plugin --profile demo add /absolute/path/to/workflow-orchestrator

# 验证配置层已生效（应看到 "# == dsh-workflow-orchestrator"）
dsh --profile demo --dump-config

# 启动
dsh --profile demo web
```

开发期也可用 overlay 直接加载源码：

```bash
dsh --profile demo --patch ./cordis.patch.yml --dump-config
```

## 注册的工具

| 工具 | 作用 |
|------|------|
| `workflow.list` | 列出已注册工作流 |
| `workflow.get` | 按 id 获取完整 JSON 定义 |
| `workflow.validate` | 校验 JSON/YAML 定义，返回 issues |
| `workflow.run` | 执行工作流，inputs 为 JSON 对象字符串 |
| `workflow.history` | 查看最近运行记录 |
| `workflow.export` | 导出 YAML |
| `workflow.register` | 注册/覆盖工作流（可由 `allowMutations: false` 关闭） |
| `workflow.remove` | 删除工作流（同上） |

宿主侧事件：`workflow/registered`、`workflow/removed`、`workflow/run-started`、`workflow/node`、`workflow/log`、`workflow/run-finished`。

## 配置

在 profile 的 cordis.yml（或本 bundle 的 `cordis.patch.yml`）中配置：

```yaml
- id: workflow-orchestrator
  name: dsh-workflow-orchestrator
  config:
    toolPrefix: workflow
    enableTools: true
    allowMutations: true
    maxIterations: 100
    maxParallelBranches: 8
    maxDelayMs: 60000
    httpTimeoutMs: 10000
    maxWorkflows: 100
    maxHistory: 50
    persistencePath: ''   # 非空时持久化到 JSON 文件（原子写入）
    emitEvents: true
```

所有字段都有 schema 默认值，非法配置会在插件加载时直接失败。

## 节点与编辑器能力

保留全部 10 种节点：开始/结束/HTTP/条件/延迟/日志/便签/迭代/并行/代码；
以及拖拽连线、框选、复制粘贴、50 步撤销重做、分组（Bundle）、自动布局、变量引用、
JSON/YAML 导入导出、PNG/PDF/SVG 导出、模拟运行与运行历史。

Web 编辑器仍可独立开发/运行：

```bash
npm run dev        # 开发
npm run build:web  # 产出 dist/
```

## 与原实现的关键差异

- **执行引擎**：原 `Math.random()` + BFS 模拟升级为确定性拓扑执行，支持条件分支 handle、
  并行分支扇出与迭代子图；引擎不依赖 DOM，可在 Node 宿主运行。
- **安全**：变量/条件解析改为无 `eval` 的安全求值；代码节点默认不提供沙箱，会明确报错；
  HTTP 超时、迭代轮数、并行度、延迟均有上限；工作流 id 做白名单校验。
- **生命周期**：`inject = ['tools']` 声明强依赖；`Service` 由 Cordis fiber 自动注销；
  工具注册与事件监听由框架回收；需要手动释放的持久化写入合并到单个 `ctx.effect` disposer。
- **类型**：enum → const object（满足 `erasableSyntaxOnly`）；插件获得真实 DSH SDK 类型检查，
  不再用 `any` 冒充宿主 API。
- **清理**：删除死代码 `BaseNode.tsx`、store 中的 `void` 残留、重复的 `cn`/时间格式化实现；
  修复初始快照 id 漂移、导入后撤销丢连线、禁用节点状态标记错误、PDF 用 DCTDecode 嵌入 PNG 等问题。

## DSH 内嵌界面（Web / 桌面端）

插件现在和 `dsh-context` 一样带 browser half：安装后 DSH Web UI 里会出现两个入口——

- 主区标签页 **工作流**（`conversation.view` slot）
- 右侧栏标签页 **工作流**（在侧边栏指南里选择）

界面内可以：列出/选择已注册工作流、看 SVG 流程图、点“运行”看结果、导出 YAML、粘贴 JSON/YAML 覆盖注册。走 `ctx.slots.register` 注册，卸载由 Cordis fiber 自动回收；数据来自 host 的 `/api/dsh-workflow-orchestrator/*` POST 路由，浏览器相对路径，兼容反向代理前缀。

打包契约与 `dsh-context` 一致：

- `package.json` 的 `dsh.client` 声明 `platform: web` 与依赖 provider；
- `exports["./client"]` 指向 `dist-client/client.js`；
- client.js 是 classic script（`window.__ModuleLoader__.load({ id, factory })`），`react` / `react-dom` / `@deepseek-ai/*` 由 DSH 模块表提供，其余内联；
- host 入口仍是 `dist-plugin/index.js`，由 `cordis.patch.yml` 挂载。

构建命令新增 `npm run build:client`（已并入 `npm run build`）。

## 已知边界

- 内嵌界面是轻量管理器（查看 / 运行 / 导入导出），节点拖拽编辑仍在独立 Web 编辑器中完成；这是为了不把整套 xyflow 塞进 client bundle。
- 代码节点需要其它插件注入可信沙箱后才可执行；默认关闭是刻意的安全默认值。
- YAML 是工作流专用子集（标量 + 块/流 map/array），不支持锚点、多行标量、注释。

## 验证

```bash
npm run typecheck   # Web + host + client 三套 tsconfig
npm test            # vitest run，68 项
npm run build       # host bundle + client bundle + Web 产物
npm pack --dry-run  # 校验 files 含 dist-plugin、dist-client 与 cordis.patch.yml
```

## 许可证

MIT
