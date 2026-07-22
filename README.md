# 世界时间 World Clock v1.4.1

> 3D 地球世界时钟 — 纯前端 PWA，离线优先，中英双语，可打包为 Android APK。

---

## 功能

### 🌍 主页
- **3D 地球** — Three.js + WebGL，触屏拖拽缩放，大气折射晨昏线
- **166 城市** — 按 11 区域拆分加载，中英双语，覆盖全球所有时区
- **双城时差** — 卡片 + 横幅，动态跟随语言
- **快捷城市** — 最近 5 个，本地存储
- **搜索** — 中英文关键词 + 时区 + 国家，三处搜索 UI 统一
- **3 主题** — 浅色 / 深色 / 暖色
- **彗星动画** — 纯 CSS，每 10 秒刷新路径
- **WebGL 保护** — 上下文丢失自动恢复，离屏冻结渲染
- **Header 双语** — 中文显示"世界时间"，英文显示"World Clock"
- **触摸优化** — Pointer Events + 防误触，三星延迟双指适配
- **全屏 globe** — 右下角按钮，Fullscreen API，城市点击保留
- **性能监控增强** — 实时 FPS 浮层，UI/Globe/Mini-Globe 三路帧率

### 🏙️ 城市详情
- IANA 时区 + UTC 偏移 + DST 检测
- 经纬度 ISO 6709 标准 + 海拔
- 日出日落精确到秒（Meeus 算法 + 50" 折射 + 海拔修正，统一由 astro.js 计算）
- 海拔修正秒级精度
- 同时区城市跳转

### ⚖️ 城市比较
- 双城对比：时差、Haversine 距离、同天/同时区
- 工作时间重叠计算（0.5h 步进，跨午夜）
- **工作时间轴** — 双色带可视化，3h 刻度，UTC/城市A/城市B 三基准切换
- 迷你 3D 地球 + 大圆红线路径（跟随主地球 FPS 限制）

### 🌐 中英双语
- 系统语言自动检测，手动即时切换
- 城市/国家名 `name-formatter.js` 独立格式化
- i18n 调用全项目统一为 `W._()`
- `lang/en.json` 语言包

### 🔧 开发者选项
- UI 测试 + 集成测试
- **性能监控** — FPS 实时浮层（主页面 + 面板），显示 UI/主地球/迷你地球帧率
- **帧数限制** — Bresenham 算法，自适应 60/144/240Hz 屏幕，主地球与迷你地球同步
- 崩溃日志

### 📱 Android
- Capacitor 封装，minSdk 28
- 后台自动冻结渲染
- 返回键关闭面板

---

## 运行

```bash
npm install
npm run dev          # http://localhost:3456
npm run precap       # 构建 www/
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk` (~10 MB)

---

## 目录结构

```
worldclockv1.4.1/
├── index.html              # 单页主入口
├── manifest.json           # PWA 清单
├── sw.js                   # Service Worker (Cache-First)
├── version.json            # 热更新版本检测
├── package.json            # npm 脚本
│
├── css/
│   ├── base.css            # 变量、布局、搜索、主题、菜单
│   └── panels.css          # 面板、详情、比较、时间轴
│
├── js/
│   ├── app.js              # 核心：初始化、搜索、UI渲染、FPS浮层
│   ├── detail.js           # 城市详情面板
│   ├── compare.js          # 城市比较 + 工作时间轴
│   ├── mini-globe.js       # 迷你地球 + 大圆路径 + FPS限流
│   ├── i18n.js             # 多语言引擎 + W._() 挂载
│   ├── name-formatter.js   # 城市/国家名称格式化
│   ├── dev.js              # 开发者工具
│   ├── elev.js             # 海拔数据异步加载
│   ├── cities.js           # 区域文件加载器 → 扁平化为 W.CITIES
│   ├── cities/             # 11 区域城市数据 (含俄罗斯)
│   ├── clock.js            # 时钟引擎 + Haversine 距离
│   ├── astro.js            # Meeus 天文算法 (太阳位置 + 日出日落)
│   ├── theme.js            # 主题管理器
│   └── globe.js            # Three.js 3D 地球 + Bresenham 帧率控制
│
├── lang/
│   └── en.json             # 英文语言包
│
├── data/
│   ├── ne_50m_land.topojson # 陆地边界
│   ├── city-3d-coords.json  # 城市三维坐标
│   └── elevations.json      # 全球城市海拔
│
├── lib/
│   ├── three.min.js
│   └── topojson-client.js
│
└── android/                # Capacitor Android 项目
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 3D | Three.js + WebGL |
| 晨昏线 | GLSL Shader + 大气折射 |
| 天文 | Meeus 统一在 astro.js |
| 时区 | Intl.DateTimeFormat + IANA |
| i18n | W._() 统一入口 + JSON 语言包 |
| 帧率 | Bresenham 算法自适应刷新率 |
| PWA | SW Cache-First，全离线 |
| 热更新 | version.json 版本检测 |
| 打包 | Capacitor (minSdk=28) |
| 架构 | 14 JS 模块 + 2 CSS |

---

本App核心代码完全由AI辅助完成 · 版权所有：Tulatin · 开发耗时：31小时 · API消耗：9.775亿 / 977.5M tokens · API消耗费用：RMB 48.12 · 安装包体积：10M · 愿技术回归纯粹，愿沟通跨越时区。

---

📋 [完整更新日志](CHANGELOG.md)
