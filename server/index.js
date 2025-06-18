const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');

const app = express();
const PORT = 3001;
const HOST = '0.0.0.0';

// 定义视频目录映射
const VIDEO_DIRS = {
  'videos': 'G:\\videos',
  'videos1': 'G:\\videos1',
  'videos2': 'G:\\videos2'
};

// 初始化缓存
const videoCache = new NodeCache({ stdTTL: 3600 });
const videoListCache = new NodeCache({ stdTTL: 300 });

// 配置CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Cache-Control']
}));

app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 缓存中间件
const cacheControl = (req, res, next) => {
  res.set({
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD',
  });
  next();
};

// 视频流处理
const streamVideo = async (req, res, videoPath) => {
  try {
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // 检查缓存
    const cacheKey = `${videoPath}-${range || 'full'}`;
    const cachedChunk = videoCache.get(cacheKey);

    if (cachedChunk) {
      res.writeHead(206, cachedChunk.headers);
      res.end(cachedChunk.data);
      return;
    }

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1000000, fileSize - 1);
      const chunksize = (end - start) + 1;

      const headers = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };

      res.writeHead(206, headers);
      const videoStream = fs.createReadStream(videoPath, { start, end });
      
      // 缓存小于5MB的片段
      if (chunksize < 5000000) {
        const chunks = [];
        videoStream.on('data', chunk => chunks.push(chunk));
        videoStream.on('end', () => {
          const data = Buffer.concat(chunks);
          videoCache.set(cacheKey, { headers, data });
        });
      }

      videoStream.pipe(res);
    } else {
      const headers = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(200, headers);
      fs.createReadStream(videoPath).pipe(res);
    }
  } catch (error) {
    console.error('视频流错误:', error);
    res.status(500).send('视频流错误');
  }
};

// 注册视频路由
Object.keys(VIDEO_DIRS).forEach(dir => {
  app.get(`/${dir}/:filename`, cacheControl, (req, res) => {
    const basePath = VIDEO_DIRS[dir];
    const videoPath = path.join(basePath, req.params.filename);
    
    if (fs.existsSync(videoPath)) {
      streamVideo(req, res, videoPath);
    } else {
      res.status(404).send('视频未找到');
    }
  });
});

// 获取所有视频
app.get('/api/videos', (req, res) => {
  try {
    // 检查缓存
    const cachedVideos = videoListCache.get('allVideos');
    if (cachedVideos) {
      return res.json(cachedVideos);
    }

    let allVideos = [];
    let videoIndex = 1;

    Object.entries(VIDEO_DIRS).forEach(([dirName, dirPath]) => {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath)
          .filter(file => file.endsWith('.mp4'))
          .sort((a, b) => {
            const statA = fs.statSync(path.join(dirPath, a));
            const statB = fs.statSync(path.join(dirPath, b));
            return statB.mtime.getTime() - statA.mtime.getTime();
          });

        const videos = files.map(file => ({
          id: videoIndex++,
          url: `/${dirName}/${encodeURIComponent(file)}`,
          title: file.replace('.mp4', ''),
          likes: Math.floor(Math.random() * 1000),
          category: dirName
        }));
        
        allVideos = [...allVideos, ...videos];
      }
    });

    // 缓存结果
    videoListCache.set('allVideos', allVideos);
    console.log(`找到视频总数: ${allVideos.length}`);
    res.json(allVideos);
  } catch (error) {
    console.error('读取视频错误:', error);
    res.status(500).json({ error: '读取视频失败', details: error.message });
  }
});

// 按分类获取视频
app.get('/api/videos/:category', (req, res) => {
  const category = req.params.category;
  
  try {
    // 检查缓存
    const cacheKey = `category-${category}`;
    const cachedVideos = videoListCache.get(cacheKey);
    if (cachedVideos) {
      return res.json(cachedVideos);
    }

    if (category === 'all') {
      return app.handle(req, res);
    }

    if (!VIDEO_DIRS[category]) {
      return res.status(404).json({ error: '无效分类' });
    }

    const dirPath = VIDEO_DIRS[category];
    if (!fs.existsSync(dirPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(dirPath)
      .filter(file => file.endsWith('.mp4'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(dirPath, a));
        const statB = fs.statSync(path.join(dirPath, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    const videos = files.map((file, index) => ({
      id: index + 1,
      url: `/${category}/${encodeURIComponent(file)}`,
      title: file.replace('.mp4', ''),
      likes: Math.floor(Math.random() * 1000),
      category
    }));

    // 缓存结果
    videoListCache.set(cacheKey, videos);
    res.json(videos);
  } catch (error) {
    console.error(`读取分类错误 [${category}]:`, error);
    res.status(500).json({ error: `读取分类失败: ${category}`, details: error.message });
  }
});

// 启动服务器
app.listen(PORT, HOST, () => {
  console.log(`服务器运行在 http://${HOST}:${PORT}`);
  
  // 显示本地网络访问地址
  require('os').networkInterfaces()['WLAN']?.forEach(details => {
    if (details.family === 'IPv4') {
      console.log(`本地访问: http://${details.address}:${PORT}`);
    }
  });
  
  // 显示各目录内容
  Object.entries(VIDEO_DIRS).forEach(([name, path]) => {
    console.log(`\n视频目录 [${name}]: ${path}`);
    try {
      if (fs.existsSync(path)) {
        const files = fs.readdirSync(path);
        console.log(`找到 ${files.length} 个文件`);
        files.slice(0, 5).forEach(file => console.log(`  - ${file}`));
        if (files.length > 5) console.log(`  ...及其他 ${files.length - 5} 个文件`);
      } else {
        console.log(`目录不存在`);
      }
    } catch (error) {
      console.error(`读取错误: ${error.message}`);
    }
  });
});