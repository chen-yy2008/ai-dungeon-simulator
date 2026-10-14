# 正式版本发布

## 自动发布范围

用户已在本项目授权：明确要求开发或发布正式版本时，Codex 完成实现、测试、安全检查、版本与 CHANGELOG 更新后，自动提交并推送对应 Git 标签。普通讨论、审查或实验不触发发布。规则在根目录 AGENTS.md，不修改全局 Codex 设置。

当前版本信息是 release.json 的 `0.3.0`，标签为 `v0.3.0`；后续使用 X.Y.Z，标签加 v。变更说明必须有新增、改进、修复、已知局限四节。

## 一次性准备

- Git 用户名与邮箱沿用已有配置，不自行覆盖。
- 在**本项目目录**初始化 Git 并关联 origin；已存在 origin 就复用。
- 官方 GitHub CLI 可以从其官方发布页面下载。当前便携副本位于忽略的 `.tools/gh/bin/gh.exe`，不上传、不更改系统 PATH。
- CLI 未登录时执行 `.\.tools\gh\bin\gh.exe auth login --hostname github.com --git-protocol https --web`，在官方浏览器页面完成授权。不要向聊天提供密码、Token 或 Cookie。
- 登录与项目 Git 凭据是不同的连接；Codex 的 GitHub App 登录也不自动让本机 Git 能推送。只在此仓库配置所需凭据助手，保留原有全局配置。
- 如便携 CLI 被移动，项目内的绝对凭据助手路径需重新配置；也可在安装 gh 后采用适当的本机认证方式。

## 运行

在项目根目录中先进行只检查模式：

```powershell
powershell -NoProfile -File scripts/publish.ps1 -Version v0.3.0 -DryRun
```

确认通过后发布（正式版本请求已包含用户的长期发布授权，不必再逐条询问 Git 命令）：

```powershell
powershell -NoProfile -File scripts/publish.ps1 -Version v0.3.0 -Summary "世界初生：首次基准版本"
```

支持 Windows PowerShell 5.1 和 PowerShell 7。若系统策略阻止运行本地脚本，可对**本次进程**使用 `powershell -NoProfile -ExecutionPolicy Bypass -File ...`，无需更改全局执行策略。

Windows 沙箱与用户账户可能使项目目录出现不同所有者；脚本仅对每条 Git 命令指定本项目精确目录的 `safe.directory`，不使用通配符信任，也不写入全局 Git 配置。处理中文路径时使用本进程 UTF-8 编码，结束后恢复。

脚本检查精确的 Git 根目录、main 分支、身份、origin、工作区、进行中的 Git 操作、版本及标签；读取远程并拒绝远程领先或分叉历史。只接受不含内嵌凭据的 GitHub origin URL。

`release.json.files` 是逐个文件审核的白名单。新增或删除项目文件时先审核，再更新清单；仍在清单内的已跟踪文件删除可以被提交。未知改动、未知已跟踪文件或预先暂存的无关内容会导致停止，不会自动清除它们。

每次执行均重新运行：

1. 发布路径、当前源码、Git 历史、CHANGELOG 与忽略规则检查。
2. 白名单内 JavaScript / CJS 语法检查。
3. `node tests/check.cjs`。
4. `node tests/world.cjs`。
5. `node tests/browser.cjs`（需要本机 Chrome / Edge；可通过 BROWSER_PATH 指定）。
6. 测试后的再次安全检查。

没有“跳过失败测试”开关，也不会信任过期的测试成功标记。DryRun 不暂存、提交、建立标签或推送，但会读取远程、必要时 fetch，并生成忽略的测试输出。

测试前后与暂存后会比较审核清单的 SHA-256 文件快照；测试过程中源码或 HEAD 发生变化就停止，避免提交未验证的新内容。

正式执行只暂存白名单路径；建立非空的版本提交和注释标签，然后以 `git push --atomic` 同时推送 main 与指定标签，不推送其他标签、不 force push。脚本再次读取远程 SHA，核对分支与标签对象，才报告发布成功。

本流程以 Git 提交及标签作为版本交付，不自动创建 GitHub Releases 附件或上传 ZIP。版本链接为仓库的 `/tree/vX.Y.Z`。公开仓库也只提交审核过的源码、测试和演示 PNG。

## 失败与续传

任何认证、网络、安全或测试失败都会返回非零退出码。若已创建本地提交/标签但推送失败，它们保持原样：

```powershell
powershell -NoProfile -File scripts/publish.ps1 -Version v0.3.0 -Resume
```

Resume 仅用于尚未发布的本地标签，必须工作区干净、标签指向当前 HEAD、远程可快进、版本一致，并重新通过所有测试。不产生第二个提交或标签。

若服务已接收推送但确认网络中断，先检查远程分支和标签 SHA；脚本会拒绝重新发布已经存在的标签。不要用 -Resume 改写已发布版本。正式修改应使用新的版本号。

## 敏感文件与旧 ZIP

`.gitignore` 排除浏览器配置、Cookie、缓存、密钥、环境文件、下载工具、压缩包、临时文件与生成数据。发布检查也会检查实际路径、已跟踪文件及所有可达历史对象；它不输出可能的密钥正文。

工作区外层旧 `ai-dungeon-simulator.zip` 确认含浏览器配置条目，不能作为安全交付包复用；原文件没有被删除。初次检查时本项目没有 Git 仓库，因此没有既有本地 Git 历史需要改写。

扫描不是万能的秘密检测器。仍需人工审阅 staged diff 和新增素材；若发现真实密钥已在历史中，先停止发布、撤销/轮换凭据、核实传播范围。历史清理另行制定方案并取得明确授权，不自动 force push 或把 .gitignore 当作清除历史。

## 发布机制测试

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/publish.ps1
```

测试使用忽略目录中的临时**本地 bare 仓库**，覆盖预检、未知文件、模拟敏感内容、历史敏感路径、测试失败、认证失败、重复标签、推送中断与续传、远程领先和成功 SHA 核对。仅测试驱动将仓库 URL 模拟为 GitHub 格式，正式脚本没有绕过安全检查的测试开关；不会创建无意义公开仓库、版本或空提交。
