# Chrome App Mode + PWA 组合方案

## 为什么要结合 PWA？

Chrome App Mode 已经很好用了，但加上 PWA 支持后，可以获得更多实用功能，尤其是**系统通知**对任务管理场景非常有价值。

---

## 🎯 核心价值：系统通知

### 实际使用场景

**场景 1：长时间任务提醒**
```bash
# 开发者在终端执行耗时任务
tm run-tests --all

# 10 分钟后测试完成
→ 系统通知弹出："✅ 所有测试通过"
→ 即使你在看文档、写代码，也能立即知道
```

**场景 2：团队协作通知**
```bash
# 团队成员更新了任务
Alice: tm set-status --id=15 --status=done

# 你的桌面端收到通知
→ "📋 Alice 完成了任务 #15: 实现用户登录"
→ 不需要手动刷新，实时知道进度
```

**场景 3：依赖任务提醒**
```bash
# 你在等待前置任务完成
tm show 20
# 依赖：任务 #15 (pending)

# 当任务 #15 完成时
→ 系统通知："✅ 任务 #15 已完成，你可以开始任务 #20 了"
```

**场景 4：定时提醒**
```bash
# 设置番茄钟
tm pomodoro start 25

# 25 分钟后
→ 系统通知："⏰ 番茄钟结束，休息一下吧"
```

---

## 💡 PWA 带来的其他好处

### 1. 双模式使用

**CLI 模式（开发者）**
```bash
tm desktop start
tm list --board
```

**独立模式（项目经理/设计师）**
```
点击桌面图标
→ 直接打开任务看板
→ 无需使用命令行
```

**价值：**
- ✅ 技术人员用 CLI
- ✅ 非技术人员用 GUI
- ✅ 同一个工具，满足不同角色

---

### 2. 离线缓存

**场景：服务器意外关闭**
```bash
# 服务器崩溃了
tm desktop stop

# 但 PWA 仍然可以打开
点击桌面图标
→ 显示上次缓存的任务列表
→ 提示："服务器离线，显示缓存数据"
```

**价值：**
- ✅ 即使服务器挂了，也能查看数据
- ✅ 不会完全失去访问能力
- ✅ 提供降级体验

---

### 3. 更专业的安装体验

**用户体验流程：**
```
1. 首次访问 http://localhost:9527
2. Chrome 提示："安装 Task Manager？"
3. 点击安装
4. 桌面出现应用图标
5. 应用列表中出现 "Task Manager"
6. 看起来像原生应用
```

**价值：**
- ✅ 更正式的产品感
- ✅ 容易找到和启动
- ✅ 提升用户信任度

---

### 4. 自动更新机制

**传统方式：**
```bash
# 用户需要手动更新
npm update -g your-cli
```

**PWA 方式：**
```
1. 你发布新版本
2. Service Worker 后台下载
3. 用户打开应用时提示："新版本可用"
4. 点击刷新即可
```

**价值：**
- ✅ 用户无感知更新
- ✅ 始终使用最新版本
- ✅ 减少支持成本

---

## 🛠️ 实现方案

### 最小实现（1 小时）

#### 1. 添加 manifest.json

```json
{
  "name": "Task Manager Desktop",
  "short_name": "TM",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#667eea",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

#### 2. 创建 Service Worker

```javascript
// service-worker.js
const CACHE_NAME = 'tm-v1';

// 安装时缓存核心文件
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/',
        '/style.css',
        '/app.js'
      ]);
    })
  );
});

// 拦截请求，优先使用缓存
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});
```

#### 3. 在 HTML 中引入

```html
<!-- index.html -->
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#667eea">

<script>
  // 注册 Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js');
  }
</script>
```

**就这么简单！3 个文件，总共不到 50 行代码。**

---

## 🔔 系统通知实现

### 1. 请求通知权限

```javascript
// 在应用启动时请求
async function requestNotificationPermission() {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

// 使用
if (await requestNotificationPermission()) {
  console.log('通知权限已授予');
}
```

### 2. 发送通知

```javascript
function sendNotification(title, options = {}) {
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body: options.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: options.tag || 'default',
      requireInteraction: options.requireInteraction || false
    });
  }
}

// 使用
sendNotification('任务完成', {
  body: '任务 #15: 实现用户登录 已完成',
  tag: 'task-15',
  requireInteraction: true  // 需要用户手动关闭
});
```

### 3. 集成到后端

```javascript
// Desktop Manager
class DesktopManager {
  showTodo(tasks) {
    this.currentView = { type: 'todo', data: { tasks } };
    
    // 检查是否有新完成的任务
    const newlyCompleted = this.findNewlyCompletedTasks(tasks);
    if (newlyCompleted.length > 0) {
      this.notifyTasksCompleted(newlyCompleted);
    }
  }

  notifyTasksCompleted(tasks) {
    // 通过 API 通知前端
    this.currentView.notification = {
      type: 'task-completed',
      tasks: tasks
    };
  }
}
```

### 4. 前端接收并显示

```javascript
// 轮询时检查通知
async function poll() {
  const { type, data, notification } = await fetch('/api/view').then(r => r.json());
  
  // 显示视图
  switchView(type, data);
  
  // 处理通知
  if (notification) {
    handleNotification(notification);
  }
}

function handleNotification(notification) {
  if (notification.type === 'task-completed') {
    notification.tasks.forEach(task => {
      sendNotification('任务完成', {
        body: `${task.title} 已完成`,
        tag: `task-${task.id}`
      });
    });
  }
}
```

---

## 📱 实际通知示例

### 示例 1：任务状态变更

```javascript
// CLI 执行
tm set-status --id=15 --status=done

// 后端
desktopManager.notifyTaskStatusChange(15, 'done');

// 前端显示通知
→ "✅ 任务完成"
→ "任务 #15: 实现用户登录 已标记为完成"
```

### 示例 2：依赖任务解锁

```javascript
// 当任务 #15 完成时，检查依赖它的任务
const dependentTasks = findTasksDependingOn(15);

dependentTasks.forEach(task => {
  sendNotification('任务可以开始了', {
    body: `任务 #${task.id}: ${task.title} 的依赖已完成`,
    requireInteraction: true
  });
});
```

### 示例 3：长时间任务提醒

```javascript
// 任务运行超过 5 分钟
setTimeout(() => {
  sendNotification('任务仍在运行', {
    body: '测试已运行 5 分钟，请耐心等待...'
  });
}, 5 * 60 * 1000);
```

### 示例 4：团队协作通知

```javascript
// 监听任务变更（通过 WebSocket）
socket.on('task-updated', (data) => {
  if (data.updatedBy !== currentUser) {
    sendNotification('任务更新', {
      body: `${data.updatedBy} 更新了任务 #${data.taskId}`,
      tag: `task-${data.taskId}`
    });
  }
});
```

---

## 🎨 通知最佳实践

### 1. 通知分类

```javascript
const NotificationTypes = {
  SUCCESS: {
    icon: '✅',
    sound: 'success.mp3',
    requireInteraction: false
  },
  WARNING: {
    icon: '⚠️',
    sound: 'warning.mp3',
    requireInteraction: true
  },
  INFO: {
    icon: 'ℹ️',
    sound: null,
    requireInteraction: false
  },
  ERROR: {
    icon: '❌',
    sound: 'error.mp3',
    requireInteraction: true
  }
};

function sendTypedNotification(type, title, body) {
  const config = NotificationTypes[type];
  sendNotification(`${config.icon} ${title}`, {
    body,
    requireInteraction: config.requireInteraction
  });
}
```

### 2. 防止通知轰炸

```javascript
// 同一任务只显示一次通知
const notifiedTasks = new Set();

function notifyTaskCompleted(taskId) {
  if (!notifiedTasks.has(taskId)) {
    sendNotification('任务完成', { tag: `task-${taskId}` });
    notifiedTasks.add(taskId);
  }
}

// 定期清理
setInterval(() => {
  notifiedTasks.clear();
}, 60 * 60 * 1000);  // 每小时清理一次
```

### 3. 用户偏好设置

```javascript
// 允许用户控制通知
const notificationSettings = {
  taskCompleted: true,
  taskAssigned: true,
  longRunningTask: false,
  teamUpdates: true
};

function shouldNotify(type) {
  return notificationSettings[type] !== false;
}

// 使用
if (shouldNotify('taskCompleted')) {
  sendNotification('任务完成', { ... });
}
```

---

## 🔄 智能模式检测

### 自动适配运行环境

```javascript
class DesktopApp {
  constructor() {
    this.mode = this.detectMode();
    this.init();
  }

  detectMode() {
    // 检测是否从 PWA 启动
    const isPWA = window.matchMedia('(display-mode: standalone)').matches;
    
    // 检测是否从 Chrome App 启动
    const isChromeApp = window.location.search.includes('app-mode');
    
    if (isPWA) return 'pwa';
    if (isChromeApp) return 'chrome-app';
    return 'browser';
  }

  init() {
    console.log(`运行模式: ${this.mode}`);
    
    if (this.mode === 'pwa') {
      this.initPWAMode();
    } else if (this.mode === 'chrome-app') {
      this.initChromeAppMode();
    } else {
      this.initBrowserMode();
    }
  }

  initPWAMode() {
    // PWA 模式：尝试连接服务器
    this.connectToServer();
    
    // 启用通知
    this.requestNotificationPermission();
    
    // 显示安装提示（如果未安装）
    this.showInstallPrompt();
  }

  initChromeAppMode() {
    // Chrome App 模式：直接连接（服务器肯定在运行）
    this.startPolling();
  }

  initBrowserMode() {
    // 浏览器模式：显示安装提示
    this.showInstallPrompt();
  }

  async connectToServer() {
    try {
      await fetch('http://localhost:9527/api/health');
      console.log('服务器已连接');
      this.startPolling();
    } catch {
      this.showServerOfflineMessage();
    }
  }

  showServerOfflineMessage() {
    document.body.innerHTML = `
      <div class="offline-message">
        <h2>🔌 服务器未运行</h2>
        <p>请在终端运行：</p>
        <code>tm desktop start</code>
        <button onclick="location.reload()">重试</button>
      </div>
    `;
  }
}
```

---

## 📊 开发成本对比

### 纯 Chrome App Mode

```
开发时间：2 小时
功能：
✅ CLI 触发显示
✅ 多种视图组件
❌ 无系统通知
❌ 无离线能力
❌ 无独立使用
```

### Chrome App Mode + PWA

```
开发时间：3 小时（+1 小时）
功能：
✅ CLI 触发显示
✅ 多种视图组件
✅ 系统通知 ← 新增
✅ 离线能力 ← 新增
✅ 独立使用 ← 新增
✅ 自动更新 ← 新增
✅ 桌面图标 ← 新增
```

**结论：只需多花 1 小时，获得 5 个重要功能！**

---

## 🎯 推荐实施步骤

### 阶段 1：基础实现（2 小时）

```bash
# 实现 Chrome App Mode
1. Desktop Manager
2. Express 服务器
3. 前端组件（TODO/Image/Diff）
4. CLI 集成
```

### 阶段 2：添加 PWA（1 小时）

```bash
# 添加 PWA 支持
1. 创建 manifest.json
2. 创建 service-worker.js
3. 在 HTML 中引入
4. 测试安装流程
```

### 阶段 3：系统通知（30 分钟）

```bash
# 实现通知功能
1. 请求通知权限
2. 封装通知函数
3. 集成到任务状态变更
4. 测试通知效果
```

### 阶段 4：优化体验（30 分钟）

```bash
# 完善细节
1. 添加离线提示
2. 实现智能模式检测
3. 添加用户设置
4. 优化通知策略
```

**总计：4 小时完成完整方案**

---

## 💡 关键价值总结

### 为什么系统通知很重要？

1. **提升效率**
   - 不需要频繁切换窗口查看状态
   - 长时间任务完成时立即知道
   - 多任务并行时不会遗漏

2. **改善协作**
   - 团队成员更新任务时实时通知
   - 依赖任务完成时自动提醒
   - 减少沟通成本

3. **更好的用户体验**
   - 像原生应用一样的通知体验
   - 即使窗口最小化也能收到通知
   - 提升产品专业度

### 为什么要结合 PWA？

1. **灵活性**
   - CLI 用户和 GUI 用户都满意
   - 技术人员和非技术人员都能用
   - 一个工具，多种使用方式

2. **可靠性**
   - 离线缓存保证基本可用
   - 自动更新保证版本最新
   - 降级体验保证不会完全失效

3. **专业性**
   - 可以安装到桌面
   - 有独立的应用图标
   - 看起来像正式产品

---

## 🚀 总结

**Chrome App Mode + PWA = 完美组合**

- ✅ 开发成本低（4 小时）
- ✅ 功能完整（通知、离线、独立使用）
- ✅ 用户体验好（像原生应用）
- ✅ 维护成本低（就是网页）
- ✅ 扩展性强（可迁移到 Tauri）

**强烈推荐在 Chrome App Mode 基础上添加 PWA 支持！**

系统通知功能对于任务管理场景来说，是一个"小投入、大回报"的功能，绝对值得实现。
