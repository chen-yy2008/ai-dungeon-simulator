# 连续开发进度（v0.7 已交付，准备 v0.8）

2026-10-14。批准队列 v0.4 → Pages → v0.5 → v0.6 已全部完成；没有启动 v0.7。PAUSE_AUTODEV 阶段检查均不存在。

| 版本 | 正式提交 | 发布 / 部署核验 |
| --- | --- | --- |
| v0.4.0 | e2480fde38fe10bd19fcd859cdf7757ffa640e27 | 远程标签一致；Pages 托管 run 38516972151 success；HTTP/source SHA/在线 Chrome 通过 |
| v0.5.0 | dac747811331bba3b5e79f008a8220fde49c13c6 | 远程标签一致；Pages 托管 run 38517283728 success；HTTP/source SHA/在线 Chrome 通过 |
| v0.6.0 | 7da830ef21ac81ae4f2a10a62e395492677e16ca | 远程标签一致；自定义 Actions run 38518722121 build/deploy success；HTTP/source SHA、9 个资源与在线角色卡交互通过 |

网站：https://chen-yy2008.github.io/ai-dungeon-simulator/ 。仓库：https://github.com/chen-yy2008/ai-dungeon-simulator 。目前 Pages build_type=workflow，网站运行 v0.6 标签，后续纯文档检查点不更新站点。

测试：v0.4 世界 590671 行动；v0.5/v0.6 默认世界 600000 行动 / 120 配置；NPC 五链 36000 行动；角色卡 24000 行动及存档续演；核心 300 地图 + 300 战斗；Windows Chrome/Edge、390px、在线 Chrome、Ubuntu Actions Chrome；PowerShell 5.1 发布保护 13 本地用例全部通过。具体覆盖与限制见对应版本报告。

首次 workflow 权限不足：App 403 未绕过，使用已授权官方分支式后备完成 v0.4/v0.5。第一次授权无人操作过期，用户要求重新申请后授权成功，CLI scopes repo/workflow 正常。首次自定义标签未观察到自动运行，已派发明确 v0.6.0 并成功；AGENTS 明确以后检查运行并在未触发时自主派发。

世界/角色源码沿用核心，无新的框架、后端、LLM、付费服务或多角色。六维/设定等级不重算战斗；描述能力与文本愿望不执行规则；NPC 内容有限、日程非连续寻路。没有遗留关键测试失败或权限阻碍；后续开发需用户新指令。

旧 ZIP 浏览器资料保留在外层，不提交；本轮准确白名单、忽略、可达历史安全检查通过，不承诺扫描可识别所有秘密。最终核验文档以安全快进检查点推送，不改写标签或历史。

## v0.7 本轮开始
2026-10-14：用户新授权视觉重制，已完整阅读任务书；main 与 origin/main 同为 fffcb1c。创建 feat/v0.7-visual-overhaul；原用户新增任务书保留。CLI repo/workflow 有效，Pages 沿用自定义工作流，尚未更新线上。已实际生成 v0.6 世界/地牢/人物卡/390px 截图到 docs/visual-comparison。官方 Ninja Adventure / Kenney Fantasy UI Borders 确认 CC0，正在下载筛选，资源与测试临时文件沿用已有项目忽略目录。

2026-10-14：v0.7全部本地视觉/逻辑/Chrome/Edge/file://验收通过；22PNG190156字节、运行包约345222字节。PowerShell13保护用例通过；开发分支2089829已安全快进本地main，尚未推送正式v0.7标签。用户追加批准v0.8→v0.9→v1.0，原新任务书完整读取、规格已建立；v0.7发布和Pages核验后进入v0.8，尚无下一版玩法改动。

v0.7最终：093e3d1563b8dff4146d5d4c01e60121d552ae44 / v0.7.0；Actions 38544111128 success（首次环境拒绝标签，追加v*允许规则后重跑同版成功，原分支/审查保留）。HTTP35资源200/源SHA、在线Chrome全旧/新视觉/手机检查通过。接下来独立feat/v0.8-fate，保留v0.7线上；本轮有限队列到v1.0，尚未实现v0.8玩法。
