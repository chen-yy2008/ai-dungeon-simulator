# 历史存档回归夹具

这两份JSON是合成测试数据，不是用户冒险/浏览器资料。使用本仓库原v0.3.0与v0.6.0标签的core/events/world及各自所需模块，在隔离Node VM中，以classId=mage、seed=historical-migration运行200次真实逻辑行动后调用toSave生成。无用户账户、Cookie、密钥或外部服务。

- historical-03.json：v0.3.0实际数据结构。
- historical-06.json：v0.6.0实际角色卡/日程/关系数据结构。

tests/experience.cjs校验迁移不改变HP、金币、药水、疲劳、背包、位置、历史与随机源，然后实际续演300动作。固定回归输入随源码审核提交；普通测试输出/自动下载仍在忽略目录，Pages运行包不包含测试夹具。
