# FavouriteLove - 本地视频播放器

一个类似TikTok的本地视频播放器，支持局域网访问，让你在本地网络环境中享受短视频体验。

## ✨ 特性

- 🎥 垂直滚动视频播放
- 🎮 视频控制（播放/暂停/进度条）
- ❤️ 点赞/取消点赞功能
- 📱 响应式设计，支持手机访问
- 🏷️ 支持视频分类播放
- ⚡ 自动播放和预加载机制
- 🌐 局域网访问支持
- 🗄️ MySQL数据库支持，自动同步视频信息

## 🚀 快速开始

### 环境要求

- **Node.js** (v14或更高版本)
- **MySQL** (v8.0或更高版本)

### 安装依赖

```bash
npm install --legacy-peer-deps
```

### 数据库配置

#### 1. 安装MySQL
- 下载并安装MySQL Server 8.0
- 安装时设置root用户密码（默认：140027）

#### 2. 自动初始化（推荐）
项目启动时会自动检查并创建数据库和表，无需手动操作。

#### 3. 修改数据库位置（可选）

如果你需要将MySQL数据目录移动到其他位置（如G盘），请按以下步骤操作：

**步骤1：停止MySQL服务**
```cmd
net stop mysql80
```

**步骤2：复制数据目录**
```cmd
xcopy "C:\ProgramData\MySQL\MySQL Server 8.0\Data" "G:\mysql\Data" /E /H /K /Y
```

**步骤3：设置权限**
```cmd
icacls "G:\mysql\Data" /grant "NT SERVICE\mysql80":(OI)(CI)(F)
```

**步骤4：修改MySQL配置文件**
找到MySQL配置文件（通常在 `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini`），修改以下内容：

```ini
[mysqld]
# 修改数据目录路径
datadir=G:/mysql/Data

# 其他配置保持不变
port=3306
socket=mysql
key_buffer_size=16M
max_allowed_packet=1M
table_open_cache=64
sort_buffer_size=512K
net_buffer_length=8K
read_buffer_size=256K
read_rnd_buffer_size=512K
myisam_sort_buffer_size=8M
thread_cache_size=8
query_cache_size=16M
tmpdir=C:/Windows/Temp/
```

**步骤5：重启MySQL服务**
```cmd
net start mysql80
```

---

> **注意：**
> - 你只需安装好MySQL并记住root密码，项目会自动完成数据库和表的创建。
> - 如果需要自定义数据库名、用户名或密码，请同步修改 `server/index.js` 中的配置。

### 一键启动（推荐）

```bash
npm run dev:all
```

这个命令会：
- 自动检测并配置本机IP地址
- 自动检查并创建数据库和表（如果不存在）
- 启动后端服务器（端口3001）
- 启动前端开发服务器（端口5173）
- 生成二维码供手机扫码访问
- 自动同步本地视频到数据库

### 分步启动

如果你需要分别启动前后端：

```bash
# 启动后端服务器
npm run server

# 启动前端开发服务器
npm run dev
```

## 📱 访问方式

启动成功后，你可以通过以下方式访问：

- **本机访问：** http://localhost:5173
- **局域网访问：** http://[你的IP地址]:5173
- **手机扫码：** 启动时会自动显示二维码

## 🌐 前后端接口地址与局域网访问说明

### 后端接口监听

- 后端 Express 服务器在 `server/index.js` 中通过如下方式监听所有网卡地址：
  ```js
  const HOST = '0.0.0.0';
  app.listen(PORT, HOST, ...)
  ```
- 这样可以让局域网内的其他设备通过你的电脑IP访问后端接口（如 `http://192.168.x.x:3001`）。

### 前端接口地址自动适配

- 前端通过 `.env` 文件中的 `VITE_API_BASE_URL` 环境变量来决定请求哪个后端接口。
- 该变量由根目录下的 `set-ip-env.cjs` 脚本自动生成，每次运行 `npm run dev:all` 时会自动检测本机无线网卡或第一个可用IPv4地址，并写入 `.env` 文件。例如：
  ```env
  VITE_API_BASE_URL=http://192.168.x.x:3001
  ```
- 前端代码中通过如下方式获取接口地址：
  ```js
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
  ```
- 所有前端请求后端API时，都会用 `API_BASE_URL` 作为前缀，确保无论在本机还是手机访问，都能自动适配正确的后端接口。

### 访问流程总结

1. 启动项目时自动检测本机IP并配置前端接口地址。
2. 后端监听所有网卡，局域网内设备可访问。
3. 前端通过 `.env` 自动适配后端API地址，无需手动修改。
4. 控制台会显示本机和局域网访问地址，并生成二维码，方便手机扫码访问。

## 📁 项目结构

```
FavouriteLove/
├── src/                    # 前端React应用
│   ├── components/         # React组件
│   └── App.tsx            # 主应用组件
├── server/                 # 后端Express服务器
│   ├── videos/            # 视频文件目录
│   └── index.js           # 服务器入口
├── package.json           # 前端依赖配置
├── set-ip-env.cjs        # IP自动配置脚本
└── server/package.json    # 后端依赖配置
```

## 🎬 添加视频

1. 在 `server` 目录下创建视频文件夹：
   ```bash
   cd server
   mkdir videos
   ```

2. 将MP4格式的视频文件放入 `videos` 文件夹中

3. 可选：创建多个分类文件夹
   ```bash
   mkdir videos1
   mkdir videos2
   mkdir videos3
   ```

4. 重启应用，系统会自动同步新视频到数据库

## 🔧 其他命令

```bash
# 只配置IP地址
npm run set-ip-env

# 构建生产版本
npm run build

# 代码检查
npm run lint
```

## ⚠️ 注意事项

- **视频格式：** 只支持MP4格式的视频文件
- **文件位置：** 视频文件必须放在 `server/videos` 目录下
- **网络访问：** 确保防火墙允许5173和3001端口访问
- **依赖安装：** 如果遇到依赖冲突，请使用 `--legacy-peer-deps` 参数
- **数据库：** 确保MySQL服务正在运行，默认端口3306
- **数据库密码：** 默认密码为140027，如需修改请更新 `server/index.js` 中的配置
- **微信浏览器自动播放限制：** 微信浏览器（包括微信内置WebView、QQ浏览器等）对视频的自动播放和自动切换有严格限制，通常只有用户手势（如点击、触摸）才能触发播放。自动切换下一个视频时，可能无法自动播放，建议用户手动点击播放，或采用静音自动播放方案。此为微信浏览器的安全策略，无法通过代码完全绕过。

## 🛠️ 故障排除

### 常见问题

1. **无法访问应用**
   - 检查IP地址配置是否正确
   - 确认防火墙设置
   - 验证端口是否被占用

2. **视频无法播放**
   - 确认视频文件是MP4格式
   - 检查视频文件是否放在正确的目录
   - 查看浏览器控制台是否有错误信息

3. **手机无法访问**
   - 确认手机和电脑在同一WiFi网络
   - 检查IP地址配置
   - 验证防火墙设置

4. **数据库连接失败**
   - 确认MySQL服务正在运行
   - 检查数据库用户名和密码
   - 验证数据库名称是否正确

5. **视频信息不同步**
   - 重启应用，系统会自动同步
   - 检查数据库连接是否正常
   - 查看服务器控制台错误信息

### 有用的命令

```bash
# 查看端口占用情况
netstat -ano | findstr :5173
netstat -ano | findstr :3001
netstat -ano | findstr :3306

# 杀死占用端口的进程
taskkill /PID [进程ID] /F

# 查看本机IP地址
ipconfig

# MySQL服务管理
net start mysql80
net stop mysql80

# 连接MySQL数据库
mysql -u root -p
```

## 📝 开发说明

- 首次启动时建议先在本地（localhost）测试，确认功能正常后再配置局域网访问
- 只有首次或依赖变动时需要 `npm install`，日常开发只需 `npm run dev:all`
- 项目使用Vite作为构建工具，支持热重载
- 后端使用Express框架，支持CORS跨域访问
- 数据库使用MySQL，支持视频信息持久化存储
- 系统会自动同步本地视频文件到数据库，无需手动管理
