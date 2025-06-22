# FavouriteLove - 本地视频播放器

A TikTok-like video feed application that runs on your local network. This application allows you to browse and watch videos stored locally on your computer, with a similar interface to TikTok.

这是一个类似于TikTok的短视频项目，但是只支持本地部署，有点像一个私人定制的短视频网站。

## Features

- 垂直滚动视频播放
- 视频控制（播放/暂停/进度条）
- 点赞/取消点赞功能
- 响应式设计
- 支持视频分类播放
- 自动播放功能
- 预加载机制
- 本地网络访问

## Prerequisites

- **Node.js** (v14或更高版本) - 安装后自动包含npm

## 环境安装

### 下载并安装Node.js

#### Windows系统
1. 访问Node.js官网：https://nodejs.org/
2. 下载LTS版本（推荐，更稳定）
3. 运行下载的安装包（.msi文件）
4. 按照安装向导完成安装

#### Mac系统
1. 访问Node.js官网：https://nodejs.org/
2. 下载LTS版本的macOS安装包
3. 运行.pkg安装文件
4. 按照安装向导完成安装

#### Linux系统
```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs
```

### 验证安装
```bash
# 检查Node.js版本
node --version

# 检查npm版本
npm --version
```

### 配置npm镜像（可选，国内用户推荐）
```bash
# 设置淘宝镜像，提高下载速度
npm config set registry https://registry.npmmirror.com
```

## Project Structure

```
FavouriteLove/
├── src/                    # 前端React应用
│   ├── components/         # React组件
│   └── App.tsx            # 主应用组件
├── server/                 # 后端Express服务器
│   ├── videos/            # 视频文件目录
│   └── index.js           # 服务器入口
├── package.json           # 前端依赖配置
└── server/package.json    # 后端依赖配置
```

## Setup Instructions

### 1. 安装依赖

#### 安装前端依赖
```bash
npm install
```

#### 安装后端依赖
```bash
cd server
npm install
cd ..
```

### 2. 配置IP地址

**重要：** 需要修改两个文件中的IP地址配置，以便在局域网中访问。

#### 查看本机IP地址
- **Windows:** 打开命令提示符，输入 `ipconfig`
- **Mac/Linux:** 打开终端，输入 `ifconfig`
- 找到你的局域网IP地址（通常是192.168.x.x格式）

#### 修改配置文件

**修改 `vite.config.ts`：**
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    host: '你的IP地址',  // 例如: '192.168.1.100'
    port: 5173,
    strictPort: true,
  }
})
```

**修改 `src/components/VideoFeed.tsx`：**
```typescript
const API_BASE_URL = 'http://你的IP地址:3001';  // 例如: 'http://192.168.1.100:3001'
```

### 3. 准备视频文件

在 `server` 目录下创建视频文件夹：

```bash
cd server
mkdir videos
```

**可选：创建多个分类文件夹**
```bash
mkdir videos1
mkdir videos2
mkdir videos3
```

将MP4格式的视频文件放入这些文件夹中。

## Running the Application

### 启动后端服务器
```bash
cd server
npm start
```
后端将在端口3001运行，如果嫌太麻烦那就可以使用以下指令进行快捷执行，实际上效果相同

```shell
npm run server
```

### 启动前端开发服务器
```bash
# 在项目根目录
npm run dev
```
前端将在端口5173运行

### 访问应用
- **本地访问：** http://localhost:5173
- **局域网访问：** http://[你的IP地址]:5173

## 手机访问设置

如果想让手机访问，确保：

1. **网络连接：** 手机和电脑连接同一个WiFi网络
2. **IP配置：** 正确配置了IP地址（不能使用localhost）
3. **防火墙设置：** 允许5173和3001端口的访问

#### Windows防火墙设置
1. 打开"Windows Defender 防火墙"
2. 点击"允许应用或功能通过Windows Defender防火墙"
3. 点击"更改设置"
4. 找到Node.js，确保在"专用"和"公用"网络都勾选

## 注意事项

- **视频格式：** 只支持MP4格式的视频文件
- **文件位置：** 视频文件必须放在 `server/videos` 目录下
- **网络访问：** 如果要在局域网中访问，需要确保防火墙设置正确
- **端口占用：** 确保3001和5173端口没有被其他程序占用

## 故障排除

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

### 有用的命令

```bash
# 查看端口占用情况
netstat -ano | findstr :5173
netstat -ano | findstr :3001

# 杀死占用端口的进程
taskkill /PID [进程ID] /F

# 查看本机IP地址
ipconfig
```

## Notes

- The application only works with MP4 video files
- Videos must be placed in the `server/videos` directory
- The application is accessible from any device on your local network using your computer's IP address
- 首次启动时建议先在本地（localhost）测试，确认功能正常后再配置局域网访问
