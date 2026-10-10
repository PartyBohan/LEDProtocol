---
name: partykeys-protocol
description: 为其他项目接入或修复 PartyKeys / 音乐密码琴键亮灯，复用和弦切切乐已由用户确认通过的 Web MIDI 与 PartyStudio / SAM5704 大音箱中转方案。Use for lighting integration, 能弹奏计分但不亮灯, MIDI SysEx output, device detection, palette CMD 0x71, RGB CMD 0x15, PopuPiano CMD 0x1E/0x20/0x23, key mapping, initialization, routing, reconnection, pacing and protocol tests. Includes reusable code and offline tests; use with partykeys-foundation. Not a general MIDI audio, Bluetooth pairing, deployment or account-access skill.
---

# 音乐密码亮灯接入

把切切乐已经验证的亮灯链路接入新项目，保留目标项目的音频、弹奏判定和连接所有权。调用示例：`用 $partykeys-protocol，按切切乐已验证方案给这个项目接入琴键亮灯。`

## 先选择协议，不要混用

1. 先使用 `partykeys-foundation`，读取其要求的基础约束。
2. 按实际设备与请求选读；选中的参考必须完整阅读：
   - **复用切切乐、PartyKeys Web MIDI、手机接大音箱 APP 口、大音箱无线接琴、PartyStudio / SAM5704，或能计分不亮灯**：读 [已验证 Web MIDI 接入](references/verified-web-midi.md)，优先复用随附代码。
   - **明确要求直连 RGB 自定义颜色 / CMD 0x15 / 旧版协议审查**：读 [PartyKeys 协议](references/partykeys-led.md)。不能把 RGB 初始化发给已验证的 palette71 中转配置。
   - **PopuPiano 29 键**：读 [PopuPiano 协议](references/popupiano-led.md)，用独立设备配置；本次用户确认不覆盖它。
   - 未知设备：先只读检查名称、输入/输出与传输能力；不向第一个可用 MIDI 口盲发私有命令。
3. 确认目标项目、当前 MIDI 输入模块、输出端口、宿主桥接方式和灯光音符来源。能够从代码发现的先检查；只有影响接入结果的缺项才问用户。

## 实施流程

1. 检查项目说明、现有改动与 MIDI/灯光调用点，保留用户改动。用户只要求诊断时不改代码。
2. 新接入复用 `assets/web-midi/` 三个 `.mjs` 文件；已有灯光实现先对比，保留一个发送控制器，避免两套实现抢灯。代码是无依赖 ESM，可用于 JavaScript / TypeScript 项目。
3. 从现有 Web MIDI 连接层传入端口；让现有输入回调把收到的原始字节旁路给灯光模块。不要覆盖、吞掉正常弹奏输入，也不要重新接管 App 的 BLE。
4. 灯光和屏幕提示使用同一份 **实际 MIDI 音符数组**。由目标项目决定预亮、暂停、恢复和关卡时机；不要复制切切乐游戏判定或擅自加启动演示。
5. 设备/输出变化时销毁旧控制器，新建后恢复当前目标。暂停、停止、页面离开时熄灯并取消待发送任务。不要关闭宿主共享端口或断开它的蓝牙。
6. 执行随附离线测试，再执行目标项目的类型检查、测试与构建。对修改过的适配点补测试。
7. 区分“程序已发送”和“实物已亮灯”。交付说明设备配置、测试结果、未实测链路；必要时请用户做真机灯键一致性、快速切换及重连验收。

## 不可破坏的规则

- 已验证配置：palette71、模式 `F0 7F 30 7F 7F 20 00 0F 05 F7`；颜色帧设备类型仍为 `05`，每包最多 **3 个音符/颜色对**，包间隔 **8 ms**。
- 初始化后先清灯、等待模式稳定，再查询与恢复当前目标。保留发现/分配通道和地址路由，不把所有包固定到 `3F`。
- 默认兼容输入音符 `48–83`；`60,64,67,72` 只是可选诊断示例。不能静默截断、取模或降八度掩盖超范围音符。
- 仅向已识别且已选中的设备发私有 SysEx；路由回报仅取自无歧义配对的输入口。普通 MIDI 设备仍可弹奏。
- 禁止用 Note On 亮灯；避免回声污染计分。Web MIDI 发送原始 SysEx，不附加 BLE 时间戳。
- MidiBrowser 单帧上限 256 字节不是大音箱链路可发送大包的许可；此配置灯包最多 16 字节。
- App/native 已连接的设备由宿主管理。SysEx 不可用时明确提示“可弹奏，亮灯暂不可用”，不假装已经点亮。
- 仅灯光接入不改音色、不全局静音。若任务也涉及外接音箱，只在可靠连接状态确认后静音网页钢琴，保留音效与 BGM；CMD `05` 拓扑变化不是音箱在线证据。
- 不把私有仓库、账号、密码、Token 打包进 Skill。使用本技能不授权部署、推送代码、邀请协作者或更改账号权限。

## 验证与资源

- 接入说明和证据边界：[references/verified-web-midi.md](references/verified-web-midi.md)
- 安全入口：[assets/web-midi/connect-lighting.mjs](assets/web-midi/connect-lighting.mjs)
- 包编码/队列：[assets/web-midi/partykeys-lights.mjs](assets/web-midi/partykeys-lights.mjs)
- 键盘发现/路由：[assets/web-midi/partykeys-routing.mjs](assets/web-midi/partykeys-routing.mjs)
- 离线回归：`node --test <skill-dir>/scripts/lighting.test.mjs <skill-dir>/scripts/routing.test.mjs`（Node 18+，无 npm 安装、网络或硬件写入）。先解析实际 Skill 路径，不把机器绝对路径写入项目。

## 冲突与新固件

用户当前要求与实测证据优先；经过确认的差异必须隔离为具名设备配置。其他场景遵循 Foundation，再参考通用协议，不把单台设备的成功推广为所有手机/固件均通过。新固件问题可查 `https://protocol.partykeys.ai/` 与 `https://github.com/allen4z/PartykeysProtocol`；复用本次已确认配置不需要登录原内部仓库。
