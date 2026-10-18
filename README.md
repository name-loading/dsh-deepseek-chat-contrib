![DeepSeek Chat：CHAT 与 HARNESS 一键切换](docs/images/readme-cover.png)

<h1 align="center">DeepSeek Chat</h1>

<p align="center"><strong>在 DeepSeek Harness 中，一键切换网页聊天与原工作区。</strong></p>

<p align="center"><strong>简体中文</strong> · <a href="README.en.md">English</a></p>

---

CHAT模式 加载真实的 [DeepSeek Chat 官网](https://chat.deepseek.com/)，使用官网的聊天功能和账号历史；HARNESS模式 为原 DSH 工作区。

当前版本 **0.2.4** · 适配 **DSH 桌面版** · 默认语言为简体中文。

## 功能预览

### 在 DSH 里使用 DeepSeek 网页聊天

![CHAT 模式：DSH 原侧栏与 DeepSeek 官网聊天页面](docs/images/chat-overview.png)

- 共用 DSH 原侧栏，显示官网对话标题、置顶和日期分组。
- 每条对话右侧提供“更多操作”：重命名、置顶／取消置顶、分享、删除；菜单和重命名弹窗与 HARNESS 共用 DSH 原生组件，修改由官网保存；分享、删除保留官网确认流程。
- 点击历史对话继续聊天；顶部“新会话”用于新建官网对话。
- 点击“对话”右侧的刷新图标，重新加载官网当前页面并更新列表。在其他网页端新建对话后，可用它同步，无需退出 DSH。
- 搜索筛选已加载的对话标题，聊天正文和输入框由官网提供。
- 正文、输入文字和占位提示跟随 HARNESS 正文字号，默认 14px；在 DSH 中调整正文字号时，CHAT 同步更新。
- CHAT 对话页面的明暗主题跟随 HARNESS；HARNESS 使用“跟随系统”时，CHAT 同步采用当前实际主题，无需刷新页面。
- 对话标题位于左上角，点击标题使用官网原有的名称编辑功能。

### 随时切回 HARNESS

![品牌行中的 CHAT 与 HARNESS 模式切换器](docs/images/mode-switch.png)

切换器位于左侧顶部的 DeepSeek 品牌旁。白色圆角表示当前模式；切回 HARNESS 会恢复进入 CHAT 前的主面板，再进入 CHAT 时回到刚才的网页。折叠侧栏后，可通过原展开按钮回到切换器。

### 中文设置与网页登录记忆

![CHAT 设置：网页登录记忆、登录状态与简体中文选项](docs/images/chat-settings.png)

在 DSH 原生 **设置 → CHAT设置** 中查看官网账号状态、退出登录和切换语言。

- 默认简体中文，也可选择 English 或跟随系统；主动选择的语言会保存。
- CHAT 使用独立的官网登录，DSH 账号退出或 CHAT 退出都不禁用模式切换器。
- 设置与对话页面使用同一个网页登录；登录后自动更新账号和列表，登录记忆在后台保存。
- 首次在插件内正常登录官网后，出现 **“已记住网页登录”** 即表示插件已保存本次授权。
- 重开同一个 DSH 配置环境后，插件恢复授权并由官网验证；授权失效时仍需重新登录。

## 安装

### 按名称安装（推荐）

在 DSH 的插件安装输入框中输入下方名称和版本号，安装当前最新发布版本：

```text
dsh-deepseek-chat@0.2.4
```

也可以使用命令行：

```bash
dsh plugin --profile desktop add dsh-deepseek-chat@0.2.4
```

首次安装和更新已有插件均使用这一方式。若新版本被 DSH 的发布时间策略暂时拦截，可稍后重试，或使用下方 GitHub 安装方式。

### GitHub 地址安装

在 DSH 的插件安装输入框中粘贴：

```text
https://github.com/xingxingbk-git/dsh-deepseek-chat
```

也可以使用命令行：

```bash
dsh plugin --profile desktop add https://github.com/xingxingbk-git/dsh-deepseek-chat
```

此方式安装已推送到仓库的版本，仓库包含构建文件，无需手动构建。需要系统已安装 Git，且 `git --version` 能正常运行；Windows 可先安装 [Git for Windows](https://git-scm.com/install/windows)，再重开 DSH。

### 本地安装包

将 `.tgz` 安装包交给 DSH 插件管理器安装，或使用命令行：

```bash
dsh plugin --profile desktop add /absolute/path/dsh-deepseek-chat-0.2.4.tgz
```

将路径替换为实际安装包位置。

**安装完成后，完整退出并重新打开 DSH，在插件管理页确认版本为 0.2.4。** 使用其他 profile 时，将命令中的 `desktop` 替换为对应名称。

更多说明参见 [DSH 官方插件安装文档](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)。

## 开始使用

1. 选择 **CHAT**。未登录时点击 **登录 DeepSeek**；也可在 **设置 → CHAT设置** 点击同一个登录入口。
2. 登录统一在 CHAT 主页面的真实官网中完成。CHAT 设置只显示账号、登录状态和语言；点击其中的登录按钮会关闭设置并进入 CHAT，登录后自动同步，无需刷新。
3. 打开 **设置 → CHAT设置**，确认出现“已记住网页登录”，按需选择语言。退出登录会清除本插件的登录记忆并正常退出官网；模式切换器继续可用。

### 将 CHAT 对话交给 Harness

1. 在 CHAT 中点击 **交给 Harness → 采集当前分支**，预览已采集的对话，并勾选需要交接的轮次（默认全选）。无法证明历史完整时，需确认仅交接已加载范围。
2. 选择 HARNESS 已配置的模型生成总结，再编辑任务简报。所选轮次会发送给该模型提供商，可能产生 API 费用。当前界面不提供官网总结；失败后可重试或明确选择仅引用原文。
3. 选择本地工作区、新建或已有会话，点击 **保存并打开 HARNESS 草稿**。

所选原文保存在目标工作目录的 `.dsh/chat-handoffs/<id>/transcript.md`，输入框只放入简报和文件引用，等待你手动发送。已有草稿、文件引用和附件会保留；可选择在光标处插入或另建会话。思考过程不采集，源图片和附件只记录可见说明、链接或已确认路径，不复制二进制文件。改变轮次选择会清除已生成的简报，避免与原文范围不一致。

当前登录在插件网页中完成。外部浏览器登录后自动授权回跳需要官网提供面向 Chat 的授权交换接口，目前未确认可用；直接在其他浏览器登录不会自动登录本插件。

页面加载失败时，可在故障提示中重试；登录保存服务连接失败时，会显示原因和重试入口。插件会自动收起官网固定的“使用环境异常”说明，其他提示、验证码和认证错误仍由官网处理。

刷新列表会重新加载当前官网页面，并保留当前对话地址。检测到未发送的输入或正在生成等状态时，会提示先完成当前操作；插件不会保存草稿。刷新中请稍候；官网加载失败或超时后，可点击右侧提示中的“重试网页”。

## 使用限制

- **兼容范围：**面向 DSH 桌面版，具体版本兼容性以 DSH 插件管理器的检查结果为准；暂不支持 DSH Web版的 CHAT 模式。
- **官网导航：**左侧列表依赖官网页面结构，只镜像已加载的导航，不是官方历史 API。结构不匹配时恢复官网原导航并自动重新识别；恢复后同步左侧列表和 CHAT设置。
- **新建快捷键：**本版适配顶部“新会话”的鼠标/Enter 点击；原 Harness 快捷键和菜单仍执行 Harness 行为，可能创建 Harness 会话并退出 CHAT。
- **登录记忆：**不共享 Safari/Chrome 登录，独立于 DSH 平台账号。授权过期、撤销或官网实现变化时需要重新登录；新版独立登录、退出重登、完整卸载和其他平台仍需扩大实机验证。
- **网页状态：**手动模式切换保留网页；插件停用、卸载或 DSH 完全退出会销毁容器，插件不备份未发送草稿，也不能代替官网停止生成。
- **网页能力：**下载、设备权限和部分弹窗受 DSH Browser 安全策略限制。消息发送、上传、另一浏览器历史一致性及长期使用仍需扩大验证。
- **交接范围：**只交接当前分支中已采集且被勾选的轮次，不保证覆盖未加载的历史。目标必须有本机工作目录；官网页面结构及各平台桌面流程仍需持续验证。

## 隐私与数据

聊天和账号历史由 DeepSeek 官网处理。插件为界面适配读取公开的导航标题、分组、链接、昵称与语言设置；导航资料只留在当前授权期间的内存中，语言偏好通过 DSH 官方配置服务保存。

网页登录记忆仅处理插件自身 `chat.deepseek.com` 页面的最小授权数据，通过 DSH 官方凭据服务保存。插件根据 DSH 启动器提供的配置路径生成独立记录标识，使不同配置的登录记忆分开，记录对应的官网账号；退出时清除旧授权并隔离迟到保存。缺少可信配置上下文时，仍可正常网页登录，但不能保存登录记忆。这依赖官网当前实现，并非稳定的官方 OAuth 接口；不承诺永久免登录。

插件不保存密码或 Cookie，不在后台保存聊天正文。只有主动交接时，才读取当前分支并把所选原文写入目标本地目录；点击生成总结时，所选原文会发送给所选 Harness 模型。插件不读取 DSH/其他插件令牌或其他浏览器的登录数据，不调用私有认证接口，不修改 DSH 安装包或关闭网页安全策略。数据流和授权边界详见 [架构说明](docs/architecture.md) 与 [网页登录说明](docs/browser-session-capability.md)。

## 开发与打包

环境：Node.js 22（22.19 及以上）或 24 及以上、pnpm 10.33.2。运行依赖目标为 Cordis 4.0.4 / React 18.3.1。

```bash
git clone https://github.com/xingxingbk-git/dsh-deepseek-chat.git
cd dsh-deepseek-chat
pnpm install --frozen-lockfile
pnpm package:plugin
```

生成 `artifacts/dsh-deepseek-chat-0.2.4.tgz`，包含 Host、Client、类型声明、图标和 bundle patch。插件管理列表的图标位于 `assets/icon.svg`，替换后重新打包安装即可；SVG 须自包含且不超过 256 KiB。

修改源码后执行 `pnpm release:prepare`，并将源码与整个 `lib/` 一起提交。`pnpm check:distribution` 会检查编译产物与源码、版本及安装入口是否一致；旧产物或缺失文件会使检查失败。安装用户不需要执行这些开发命令。

卸载插件：

```bash
dsh plugin --profile desktop remove dsh-deepseek-chat
```
