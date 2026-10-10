# 切切乐已验证的 Web MIDI 亮灯接入

## 1. 证据与适用边界

- 2026-10-10 用户明确确认：“这个亮灯已经判定 OK 了”，要求制作可复用 Skill。
- 当时故障链路：手机数据线接大音箱 APP 接口，大音箱无线连接键盘；能弹奏计分但琴键不亮。
- 冻结来源：FruitChord 提交 `dea4ad71a72cfee4cb3d5ff3d94c45767588e680` 的 `app/midi-game.ts`（仅亮灯部分）及 `app/partykeys-routing.ts`。实现曾参考用户提供的内部正常项目，但本包不依赖那个仓库、账户或网络。
- `partykeys-lights.mjs` 和 `partykeys-routing.mjs` 是上述代码去除 TypeScript 类型后的独立 ESM。`connect-lighting.mjs` 是本次封装增加的设备/SysEx/输入配对安全入口，不是额外固件协议。
- 用户确认覆盖当时所用实际链路，不等于所有 iPhone、Android、浏览器、固件或多键盘拼接均实测通过。保留此边界，不虚构型号、测量延迟或硬件 ACK。
- 已验证具名配置：`fruit-webmidi-palette71-v1`。PartyKeys、PartyStudio 及其 USB 别名 SAM5704 进入此配置。PopuPiano 不进入这个入口；RGB/旧 index14 编码虽为兼容性保留在底层文件中，不在本次中转确认范围。
- 默认输出音符范围是 MIDI 48–83，单选一个 PartyKeys 总线。发现器能解析拼接地址，但不得由此承诺任意 88 键、同地址多主琴或多输出并行均已支持。

## 2. 先检查目标项目

检查现有 MIDI 请求、端口列表、输入解析器、音频引擎、目标音符数组及页面/关卡生命周期。仅替换或接入灯光层；已有的规范实现能够复用时不叠加第二套发送者。

- 浏览器需安全上下文和 SysEx 能力；使用已有 `MIDIAccess` / 注入的 Web MIDI，保留用户手势中的音频解锁。
- 宿主 App 负责 USB/BLE 配对。嵌入 portal 的网页不要再配一次蓝牙、猜测父窗口私有 API，或关闭共享 MIDI 端口。
- 如果项目尚无 MIDI 层，在连接操作中请求 `navigator.requestMIDIAccess({ sysex: true })`；失败可回退普通 MIDI，但明确禁用亮灯。权限拒绝、桥未注入、无输出应可见，不持续弹窗。复用连接层已经归一化的 SysEx 能力；某些注入桥没有 `access.sysexEnabled` 属性，使用 `lightingSysexAvailable(access, sysexRequestSucceeded)`，只有 `{sysex:true}` 请求确实成功且返回对象未明确拒绝时才允许；不要因缺少属性误禁用已连接桥。
- 某些 WebView 稍后注入桥；根据目标宿主已说明的 ready 事件或有限重试重建连接，不无限轮询。不能仅凭能收到 Note On 推断 SysEx 输出可用。
- 不依赖端口 Map 的 `.size`；`connectedPorts` 支持 `values()` 或 `forEach()`。
- 根据明确设备名识别。未知 USB MIDI、蓝牙音频、普通键盘仍可用于弹奏，但不能猜测为可亮灯设备。

## 3. 复制与调用

将 `assets/web-midi/` 下三个文件复制到目标项目的同一目录，保留相对导入。Node / 浏览器 ESM / 支持 ESM 的构建器均可使用，无 npm 运行时依赖；类型严格的 TS 项目按实际模块配置补类型声明或保持其原有 TS 实现，不关闭全项目类型检查。

下面是在**已有连接层和输入派发器内部**使用的接线示例，不可直接覆盖已有 `onmidimessage` / `onstatechange`：

```js
import { createPartyKeysLighting, connectedPorts, lightingSysexAvailable } from './midi/connect-lighting.mjs';

let lights = null;
let active = false;
let currentNotes = [];

function rebuildLights(access, selectedOutputId, sysexRequestSucceeded = false) {
  lights?.dispose();
  lights = null;
  try {
    lights = createPartyKeysLighting({
      inputs: access.inputs,
      outputs: access.outputs,
      outputId: selectedOutputId, // 无选择时只允许唯一可识别输出
      sysexEnabled: lightingSysexAvailable(access, sysexRequestSucceeded),
      onStatus(state, detail) {
        // sent = send() 未抛错且目标已发送完；不代表硬件确认已亮。
        console.info('lighting', state, detail ?? '');
      },
    });
    if (active) lights.set(currentNotes);
  } catch (error) {
    // 展示“可弹奏，亮灯暂不可用”；不要停止原输入/音频功能。
    console.warn(String(error));
  }
}

function showTarget(notes) {
  currentNotes = [...notes]; // 同一份实际 MIDI notes 同时用于屏幕与灯光
  active = true;
  lights?.set(currentNotes);
}

function pauseOrStop() {
  active = false;
  lights?.off();
}

function resume() {
  active = true;
  lights?.set(currentNotes);
}

function leavePage() {
  active = false;
  lights?.dispose();
  lights = null;
}

// 保留原弹奏处理，仅旁路原始 bytes。无 id 的桥，按当前 connectedPorts
// 顺序生成 input-${index}；必须与 createPartyKeysLighting 的快照一致。
function inputIdFor(access, port) {
  const index = connectedPorts(access.inputs).indexOf(port);
  return index < 0 ? null : port.id ?? `input-${index}`;
}

function forwardToLights(access, port, rawBytes) {
  const id = inputIdFor(access, port);
  if (id !== null) lights?.receive(rawBytes, id);
  // 原项目原有 MIDI parser / scoring / audio 路径仍照常接收 rawBytes。
}
```

连接层应保存 `{sysex:true}` 请求是否成功，并作为示例的第三个参数传入；若已有可信归一化的布尔状态，可直接传给入口的 `sysexEnabled`。仅 `{sysex:false}` 回退成功或可以收到弹奏时，此值必须为 false。

在输出变更、断开重连、宿主桥 ready / 被替换时重建；不要在每个普通 MIDI 消息或普通 UI render 时重建。`rebuildLights` 用当前目标和当前 active 状态，暂停状态不恢复旧演示音。页面 `pagehide`、组件卸载和宿主离开事件接 `leavePage`；浏览器强制关闭时熄灯只是 best effort，不能保证最后一个包一定送达。后台是否暂停由产品规则决定，暂停时清灯，恢复时恢复当前目标。

输入回调必须保留 velocity、channel、多消息、跨包 running status、Note On velocity 0、Note Off、CC64，不以单个和弦或灯光回包替代真实弹奏输入。不要把收到的音符再回发当灯光。严格/宽松判定属于产品规则，不在这份灯光 Skill 内重新定义。

## 4. 已验证包序列（十六进制）

1. `output.open()` 成功后：模式 `F0 7F 30 7F 7F 20 00 0F 05 F7`。
2. 8 ms 后清灯：`F0 05 30 7F 7F 20 00 71 00 F7`。
3. 清灯后等待 120 ms，再查询：`F0 05 30 7F 7F 20 00 01 F7`。
4. 按当前目标发 delta；每次最多三个 `[MIDI note, palette index]` 对，包之间至少 8 ms。颜色索引 8 沿用工作版本；颜色显示受固件调色板影响。

未发现具体路由时，C4/E4/G4 示例：

```text
F0 05 30 7F 7F 20 00 71 03 3C 08 40 08 43 08 F7
```

若还需 C5（72），下一包单独发 `48 08`。帧结构为 `F0 05 30 <channel> <address> 20 00 71 <count> <note/color pairs> F7`。三对是 16 字节原始 SysEx；适配大音箱下游的小包约束。**Web MIDI 端绝不手工加 BLE 时间戳**。MidiBrowser 256 字节上限不能替代此小包限制。

数据区必须是 7-bit，音符必须为整数且在设备范围内。目标去重排序，不截断范围。清灯旧音与点亮新音做差分；每发一包后记录“实际成功发送”的键，再重新计算下一包。快速换和弦、暂停时不能继续发送旧目标剩余包。

时序是已验证实现的初始参数，不是物理 LED 延迟测量。不要给所有音频统一加 120/200 ms。不要用桥可能忽略的 `output.send(data, timestamp)` 代替这个串行队列。

## 5. 发现与路由

- 名称忽略空格、短横线、下划线及大小写。PartyStudio / SAM5704 是中转输出，不能因 manufacturer 含 PartyKeys 而当成普通琴直连 RGB。
- 输入/输出先过滤 disconnected，再保留稳定 ID。若恰好一对同名同类可配对，使用它；否则仅在该类各一输入、一输出时配对。歧义时提示用户选设备或补充明确映射，不能取列表第一个。
- 仅把配对输入的数据交给 `.receive`，其他设备的报告不参与此输出的路由。
- 报告允许设备类型 `05` / `7F`、版本 `30`、目的地址 `20 00` 或 `7E 7E`。设备在线 CMD `02` 学习通道与地址；未分配主琴（通道 0、值 1）才分配空闲通道，并等待后续回报，不预设分配成功。
- CMD `04` / `05` 为拓扑变化，700 ms 防抖后重查；查询期间不发送 idle 模式。3 秒查询没有报告时保持已有路线，不能把安静误认为断连。
- CMD `18` 是八度偏移报告；记录后刷新当前灯光。不要无故发 CMD `19` 重置用户的键盘八度。
- 发现后按真实地址与通道路由；基础范围推导为 `48 + (address - 0x3F) * 36 + octave * 12`。未匹配仍用此总线的广播 `7F/7F`，不是把一个未知 MIDI 输出当广播目标。
- 新旧路由切换先清再恢复当前目标。解析器支持分包、同包多帧和实时字节，按输入口隔离缓冲。

## 6. 生命周期与故障

- controller 的 `.set(notes)` 仅设置最新目标；`.off()` 清当前目标；`.dispose()` 清灯、取消队列/发现定时器、阻止迟到的 open Promise 再点亮。
- `send()` 抛错后不宣告成功，不循环狂发。通过现有连接层重连/重建恢复；用户仍可走原有虚拟键盘/普通 MIDI。
- 只允许一个活动灯光所有者。父 App 和 iframe 若同时发灯，需要按宿主实际接口协调所有权，不能自行猜新消息协议。
- 不使用 `port.close()` 或 BLE disconnect 清理共享会话，也不碰声音总线。
- 如果任务另含外接音箱自动静音：只有已可靠确认音箱在线才静音 **网页钢琴**，SFX/BGM 不变。键盘 CMD `05` 不是音箱在线证明；设备名称也不是。应复用宿主 `soundDeviceOnline` 或经过验证的音箱设备类型 `10/11` 的 CMD `02` 状态来源，不从这个灯光入口臆造状态。

## 7. 验收

封装验证记录（2026-10-10）：25 项离线测试在独立工作目录执行通过；Skill 格式校验、调用元数据与本地参考链接校验通过。未在封装过程中重新操作真机，硬件通过依据仍是第 1 节用户确认。

先运行 `node --test <skill-dir>/scripts/lighting.test.mjs <skill-dir>/scripts/routing.test.mjs`。测试无需 npm、网络或硬件；修改集成后，还需目标项目的 lint/typecheck/build 和输入回归。

最低验收项：

1. C4/E4/G4/C5 `[60,64,67,72]`（仅诊断）、边界音与多个大/小三和弦，发送音符和屏幕实际 MIDI notes 一致。
2. 快速换目标、分包中途暂停，不出现残留旧键；同一目标不重复刷屏。
3. 真机断开重连、切换设备、离开页面；恢复当前目标而不是旧演示音。
4. 未知端口、双设备歧义、权限失败、发送失败不能误写或假报已亮。
5. 拓扑、八度偏移、分包报告不污染按键判定；普通 MIDI 弹奏/虚拟键盘仍正常。
6. iOS/Android/电脑分别记录实际宿主、设备名、输入/输出能力与实测结果；未测项明确标注。包级测试通过不等于每个真机链路通过。

出现“能弹奏不亮灯”时按顺序只读排查：SysEx 能力 → 已选输出/名称 → 模式帧 → 小包与间隔 → 配对回报/地址 → 是否被另一控制器/宿主覆盖。只有用户确认需要修改时再改；不扩大到升级固件、安装软件、账号登录或网站发布。
