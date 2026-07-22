# 更新日志

---

## v1.4.2 (2026-07-22)

### 🆕 功能
- **165 城市** — 新增哈尔滨/长春/沈阳 3 城，删除智利圣地亚哥(同名冲突)
- **全屏 globe** — Fullscreen API 原生全屏，右下角按钮，tooltip/FPS 跟随
- **主题选择器** — 开发者面板新增主题下拉：跟随系统/浅色/深色/暖色
- **面板状态记忆** — 城市详情和比较面板切换后恢复上次选择
- **触控重构** — Touch Events → Pointer Events，三星延迟双指可靠
- **帧率自适应** — Bresenham 算法 + 交互时临时放开帧率限制

### 🔧 重构
- **Meeus 算法修复** — C(度)混入 lambda(弧度) bug，晨昏线偏 ~30 分钟
- **搜索 UI 回滚** — v1.4.1 统一 UI 还原回旧样式 (.search-result-item)
- **Haversine 统一** — 迁入 W.Clock.haversine，删除 compare/dev 重复
- **死代码清理** — panel-switch.js、name-formatter 重复加载、清迈重复
- **储存减量** — 崩溃日志 500KB→50KB，去重，30 条上限

### 🐛 Bug 修复
- 面板切换地球残影 — panel 打开时 canvas opacity:0 隐藏
- 面板关闭延迟 resume — 350ms 等 CSS 动画播完
- 彗星缩放冲突 — keyframes `left/top` → `transform` + 交互 display:none
- FPS 选择器消失 — HTML display:none 遗留修复
- 圣地亚哥命名 — 智利圣地亚哥现已被删除(避免与美国SanDiego冲突)
- Samsung 渲染破碎 — Capacitor resume rebuildSphere
- 全屏红点 tooltip — z-index 9999 + 容器内挂载

### ⚠️ 已知问题
- 时差文字溢出(平板纵向) — flex 布局自循环，CSS 方法到极限
- 全屏首帧白屏 — 需等 1-2s 才渲染
- 双指缩放跳帧 — fpsCap 和 120Hz 触控采样不匹配

### 📊 统计数据
- API 消耗：9.775 亿 / 977.5M tokens
- API 费用：RMB 48.12
- 开发耗时：31 小时
- 安装包：10 MB

---

## v1.4.1 (2026-07-21)

### 🆕 功能
- **166 城市** — 新增 23 城：俄罗斯 6 城 (UTC+2～+10)、东南亚 3 城、欧洲 5 城、非洲 3 城、大西洋岛国 5 城、东北 3 城
- **FPS 限制升级** — 从硬编码 60Hz 取模改为 Bresenham 算法，自适应 60/144/240Hz 屏幕，30fps 设置在不同刷新率下均精确
- **FPS 选择器重现** — 取消隐藏，可选 30/60/不限制
- **性能监控增强** — 同时显示 UI / 主地球 / 迷你地球 FPS，主页面右上角浮层 + 开发者面板双显示
- **帧率限制同步** — 迷你地球跟随主地球 FPS 设置
- **面板切换资源释放** — 二级菜单间切换时自动销毁前一面板的 mini globe / 详情内容
- **触控优化** — 鼠标拖拽增加 `mouseMoved` 标记 (>4px)，触屏阈值 10→12px，防拖拽误触城市

### 🔧 重构
- **Meeus 统一** — `getSunPosition` + `sunPosTo3D` 从 globe.js 迁入 astro.js，天文计算单一来源
- **搜索 UI 统一** — 主页面/城市详情/城市比较三处搜索共用 `renderSearchRow()`，删除各自内联 HTML
- **Haversine 去重** — 统一到 `W.Clock.haversine`，compare.js 和 dev.js 删除本地副本
- **CSS 清理** — 删除 `.map-zoom-controls` 等死代码，统一 `.search-item` / `.si-*` 类名

### 🐛 Bug 修复
- 开发者工具除语言外全失效 → `initDevUI` 加 guard + null-safe 绑定
- 时间轴标签双倍偏移 → `fmtLabel` 去掉重复 `refShift`，bar 位置已内置偏移
- 时间轴第二个城市无重叠渲染 → cityB bar 补上 `overlapSegments()`
- 语言切换后时间差不更新 → `populateFpsSelect` 裸 `_()` 崩溃阻塞 `updateAll()`
- 阿什哈巴德缺失 → 城市数据恢复，3D 坐标 + 海拔补全
- `fpsCap` 未定义 → 提升到模块级作用域
- 性能监控开关关不上 → `fpsInterval` 未清除
- CSS `body` 规则提前闭合 → padding 孤立属性合并回 body
- `--bg-secondary` 未定义 → 三主题加配色
- `name-formatter.js` 重复加载 → HTML 去重
- 清迈城市数据重复 → 删除第二条记录
- 多余 `</select>` → HTML 修复

### 📊 统计数据
- API 消耗：9.648 亿 / 964.8M tokens
- API 费用：RMB 47.00
- 开发耗时：28 小时
- 安装包：10 MB

---

## v1.4 (2026-07-20)

### 🔧 重构
- **城市数据库拆分**：`cities.js` 从 175 行单文件 → 10 区域文件 + 14 行加载器
- **name-formatter 独立**：从 `i18n.js` 抽离为 `js/name-formatter.js`
- **i18n 归一化**：全项目统一为 `W._()`
- **常量命名化**：`EARTH_ECCENTRICITY` / `MAX_DPR` 等

### 🆕 功能
- Header 双语
- 白昼时长 HH:MM 格式
- 时间轴 UTC/城市A/城市B 三基准切换
- 时间轴城市名中英双语分行显示

### 🐛 Bug 修复
- 英文模式 UI 文字显示中文
- APK 版本号更新
- `setFpsCap` 导出缺失
- 城市数据拆分清零修复
- cities 脚本 defer 冲突
- clock.js 三元碎裂、astro.js 自引用
- SW 缓存城市文件重复

### 📊 统计数据
- API 消耗：9.403 亿 / 940.3M tokens
- API 费用：RMB 45.44
- 开发耗时：26 小时
- 安装包：10 MB
