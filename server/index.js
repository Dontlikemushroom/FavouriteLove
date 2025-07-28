const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');
const mysql = require('mysql2/promise');

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

// 最热点赞前20接口
app.get('/api/videos/top20', async (req, res) => {
  try {
    console.log('【top20】收到请求');
    const [rows] = await pool.query('SELECT * FROM videos ORDER BY like_count DESC, id ASC LIMIT 20');
    console.log('【top20】数据库查询结果:', rows);
    // 组装前端需要的字段格式
    const videos = rows.map(row => {
      try {
        const category = guessCategoryFromPath(row.file_path);
        const url = `/${category}/${encodeURIComponent(row.file_name)}`;
        console.log('【top20】处理单条:', { id: row.id, file_name: row.file_name, file_path: row.file_path, category, url });
        return {
          id: row.id,
          url,
          title: row.title, // 直接用数据库 title 字段
          likes: row.like_count,
          category: 'top20',
          file_name: row.file_name
        };
      } catch (e) {
        console.error('【top20】单条数据处理失败:', row, e);
        return null;
      }
    }).filter(Boolean);
    console.log('【top20】最终返回视频列表:', videos);
    res.json(videos);
  } catch (error) {
    console.error('【top20】获取最热点赞视频失败:', error, error.stack);
    res.status(500).json({ error: '获取最热点赞视频失败', details: error.message });
  }
});

// 获取所有视频
app.get('/api/videos', async (req, res) => {
  try {
    // 检查缓存
    const cachedVideos = videoListCache.get('allVideos');
    if (cachedVideos) {
      return res.json(cachedVideos);
    }

    let allVideos = [];
    let videoIndex = 1;
    let dbLikeMap = {};

    // 查询所有视频的 id, file_name, like_count, title
    try {
      const [rows] = await pool.query('SELECT id, file_name, like_count, title FROM videos');
      dbLikeMap = rows.reduce((acc, row) => {
        acc[row.file_name] = { like_count: row.like_count, id: row.id, title: row.title };
        return acc;
      }, {});
    } catch (err) {
      console.error('查询数据库点赞数失败:', err);
    }

    Object.entries(VIDEO_DIRS).forEach(([dirName, dirPath]) => {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath)
          .filter(file => file.endsWith('.mp4'))
          .sort((a, b) => {
            const statA = fs.statSync(path.join(dirPath, a));
            const statB = fs.statSync(path.join(dirPath, b));
            return statB.mtime.getTime() - statA.mtime.getTime();
          });

        const videos = files.map(file => {
          const dbLike = dbLikeMap[file] || { like_count: 0, title: file.replace('.mp4', '') };
          return {
            id: dbLikeMap[file]?.id || videoIndex++,
            url: `/${dirName}/${encodeURIComponent(file)}`,
            title: dbLike.title, // 优先用数据库 title 字段
            likes: dbLike.like_count,
            category: dirName,
            file_name: file
          };
        });
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

// 搜索视频API
app.get('/api/search', async (req, res) => {
  const { q: query, category } = req.query;
  
  if (!query || query.trim() === '') {
    return res.json([]);
  }

  try {
    console.log(`【搜索】收到搜索请求: query="${query}", category="${category}"`);
    
    let allVideos = [];
    let dbLikeMap = {};

    // 查询所有点赞数
    try {
      const [rows] = await pool.query('SELECT id, file_name, like_count, title FROM videos');
      dbLikeMap = rows.reduce((acc, row) => {
        acc[row.file_name] = { like_count: row.like_count, id: row.id, title: row.title };
        return acc;
      }, {});
    } catch (err) {
      console.error('查询数据库点赞数失败:', err);
    }

    // 如果指定了分类，只搜索该分类
    if (category && category !== 'all' && VIDEO_DIRS[category]) {
      const dirPath = VIDEO_DIRS[category];
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath)
          .filter(file => file.endsWith('.mp4'))
          .filter(file => {
            const fileName = file.toLowerCase();
            const searchQuery = query.toLowerCase();
            return fileName.includes(searchQuery);
          });

        const videos = files.map(file => {
          const dbLike = dbLikeMap[file] || { like_count: 0, title: file.replace('.mp4', '') };
          return {
            id: dbLikeMap[file]?.id || Math.random(),
            url: `/${category}/${encodeURIComponent(file)}`,
            title: dbLike.title, // 优先用数据库title字段
            likes: dbLike.like_count,
            category: category,
            file_name: file
          };
        });
        allVideos = [...allVideos, ...videos];
      }
    } else {
      // 搜索所有分类
      Object.entries(VIDEO_DIRS).forEach(([dirName, dirPath]) => {
        if (fs.existsSync(dirPath)) {
          const files = fs.readdirSync(dirPath)
            .filter(file => file.endsWith('.mp4'))
            .filter(file => {
              const fileName = file.toLowerCase();
              const searchQuery = query.toLowerCase();
              return fileName.includes(searchQuery);
            });

          const videos = files.map(file => {
            const dbLike = dbLikeMap[file] || { like_count: 0, title: file.replace('.mp4', '') };
            return {
              id: dbLikeMap[file]?.id || Math.random(),
              url: `/${dirName}/${encodeURIComponent(file)}`,
              title: dbLike.title, // 优先用数据库title字段
              likes: dbLike.like_count,
              category: dirName,
              file_name: file
            };
          });
          allVideos = [...allVideos, ...videos];
        }
      });
    }

    // 按点赞数排序
    allVideos.sort((a, b) => b.likes - a.likes);
    
    console.log(`【搜索】找到 ${allVideos.length} 个匹配视频`);
    res.json(allVideos);
  } catch (error) {
    console.error('搜索视频失败:', error);
    res.status(500).json({ error: '搜索失败', details: error.message });
  }
});

// 按分类获取视频
app.get('/api/videos/:category', async (req, res) => {
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

    // 查询该分类下所有视频的点赞数
    let dbLikeMap = {};
    try {
      const [rows] = await pool.query('SELECT id, file_name, like_count, title FROM videos');
      dbLikeMap = rows.reduce((acc, row) => {
        acc[row.file_name] = { like_count: row.like_count, id: row.id, title: row.title };
        return acc;
      }, {});
    } catch (err) {
      console.error('查询数据库点赞数失败:', err);
    }

    const files = fs.readdirSync(dirPath)
      .filter(file => file.endsWith('.mp4'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(dirPath, a));
        const statB = fs.statSync(path.join(dirPath, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    const videos = files.map((file, index) => {
      const dbLike = dbLikeMap[file] || { like_count: 0, title: file.replace('.mp4', '') };
      return {
        id: dbLikeMap[file]?.id || index + 1,
        url: `/${category}/${encodeURIComponent(file)}`,
        title: dbLike.title, // 优先用数据库 title 字段
        likes: dbLike.like_count,
        category,
        file_name: file
      };
    });

    // 缓存结果
    videoListCache.set(cacheKey, videos);
    res.json(videos);
  } catch (error) {
    console.error(`读取分类错误 [${category}]:`, error);
    res.status(500).json({ error: `读取分类失败: ${category}`, details: error.message });
  }
});

// 新增：点赞接口
app.post('/api/videos/:id/like', async (req, res) => {
  const videoId = req.params.id;
  try {
    // 点赞+1
    const [result] = await pool.query('UPDATE videos SET like_count = like_count + 1 WHERE id = ?', [videoId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '视频未找到' });
    }
    // 查询最新点赞数
    const [rows] = await pool.query('SELECT like_count FROM videos WHERE id = ?', [videoId]);
    const likeCount = rows[0]?.like_count || 0;
    // 清理缓存（确保下次获取是最新）
    videoListCache.flushAll();
    res.json({ id: videoId, like_count: likeCount });
  } catch (error) {
    console.error('点赞失败:', error);
    res.status(500).json({ error: '点赞失败', details: error.message });
  }
});

// 取消点赞接口
app.post('/api/videos/:id/unlike', async (req, res) => {
  const videoId = req.params.id;
  try {
    // 点赞-1，最小为0
    const [result] = await pool.query('UPDATE videos SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?', [videoId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '视频未找到' });
    }
    // 查询最新点赞数
    const [rows] = await pool.query('SELECT like_count FROM videos WHERE id = ?', [videoId]);
    const likeCount = rows[0]?.like_count || 0;
    videoListCache.flushAll();
    res.json({ id: videoId, like_count: likeCount });
  } catch (error) {
    console.error('取消点赞失败:', error);
    res.status(500).json({ error: '取消点赞失败', details: error.message });
  }
});

// 修改视频标题
app.post('/api/videos/:id/title', async (req, res) => {
  const videoId = req.params.id;
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: '标题不能为空' });
  }
  try {
    const [rows] = await pool.query('SELECT id FROM videos WHERE id = ?', [videoId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '视频未找到' });
    }
    await pool.query('UPDATE videos SET title = ? WHERE id = ?', [title.trim(), videoId]);
    videoListCache.flushAll(); // 修改后刷新缓存
    res.json({ success: true });
    console.log('标题修改成功', videoId, title);
  } catch (err) {
    console.error('修改标题失败:', err);
    res.status(500).json({ error: '修改标题失败', details: err.message });
  }
});

// 修改视频文件名
app.post('/api/videos/:id/file_name', async (req, res) => {
  const videoId = req.params.id;
  const { file_name } = req.body;
  if (!file_name || !file_name.trim()) {
    return res.status(400).json({ error: '文件名不能为空' });
  }
  try {
    // 查出原有 file_name 和 file_path
    const [rows] = await pool.query('SELECT file_name, file_path FROM videos WHERE id = ?', [videoId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: '视频未找到' });
    }
    const oldFileName = rows[0].file_name;
    const filePath = rows[0].file_path;
    const oldFullPath = path.join(filePath, oldFileName);
    let newFileName = file_name.trim();
    if (!newFileName.toLowerCase().endsWith('.mp4')) {
      newFileName += '.mp4';
    }
    const newFullPath = path.join(filePath, newFileName);

    // 检查新文件名是否已存在
    if (fs.existsSync(newFullPath)) {
      return res.status(400).json({ error: '新文件名已存在' });
    }

    // 重命名磁盘文件
    fs.renameSync(oldFullPath, newFullPath);

    // 更新数据库
    await pool.query('UPDATE videos SET file_name = ? WHERE id = ?', [newFileName, videoId]);
    videoListCache.flushAll(); // 修改后刷新缓存
    res.json({ success: true });
    console.log('文件名修改成功', videoId, oldFileName, '=>', newFileName);
  } catch (err) {
    console.error('修改文件名失败:', err);
    res.status(500).json({ error: '修改文件名失败', details: err.message });
  }
});

// ===== 弹幕API =====
// 获取某视频的弹幕
app.get('/api/danmaku', async (req, res) => {
  const { videoId } = req.query;
  if (!videoId) return res.status(400).json({ error: '缺少videoId参数' });
  try {
    const [rows] = await pool.query(
      'SELECT * FROM danmaku WHERE video_id = ? ORDER BY time ASC',
      [videoId]
    );
    res.json(rows);
  } catch (err) {
    console.error('获取弹幕失败:', err);
    res.status(500).json({ error: '获取弹幕失败', details: err.message });
  }
});

// 添加弹幕
app.post('/api/danmaku', async (req, res) => {
  const { videoId, content, time } = req.body;
  if (!videoId || !content || time === undefined) {
    return res.status(400).json({ error: '参数缺失' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO danmaku (video_id, content, time) VALUES (?, ?, ?)',
      [videoId, content, time]
    );
    res.json({ id: result.insertId, videoId, content, time });
  } catch (err) {
    console.error('添加弹幕失败:', err);
    res.status(500).json({ error: '添加弹幕失败', details: err.message });
  }
});

// ===== 视频评论API =====
// 获取评论
app.get('/api/videos/:id/comment', async (req, res) => {
  const videoId = req.params.id;
  try {
    const [rows] = await pool.query('SELECT description FROM videos WHERE id = ?', [videoId]);
    if (rows.length === 0) return res.status(404).json({ error: '视频未找到' });
    res.json({ comments: rows[0].description || '' });
  } catch (err) {
    res.status(500).json({ error: '获取评论失败', details: err.message });
  }
});
// 添加评论（追加到description字段）
app.post('/api/videos/:id/comment', async (req, res) => {
  const videoId = req.params.id;
  const { comment } = req.body;
  console.log('收到评论请求', videoId, comment);
  if (!comment || !comment.trim()) {
    console.log('评论内容为空');
    return res.status(400).json({ error: '评论内容不能为空' });
  }
  try {
    // 只覆盖，不追加
    const [rows] = await pool.query('SELECT id FROM videos WHERE id = ?', [videoId]);
    if (rows.length === 0) {
      console.log('视频未找到', videoId);
      return res.status(404).json({ error: '视频未找到' });
    }
    await pool.query('UPDATE videos SET description = ? WHERE id = ?', [comment.trim(), videoId]);
    videoListCache.flushAll(); // 修改后刷新缓存
    res.json({ success: true });
    console.log('评论写入成功', videoId);
  } catch (err) {
    console.error('添加评论失败:', err); // 打印详细错误日志
    res.status(500).json({ error: '添加评论失败', details: err.message });
  }
});

// 辅助函数：根据数据库行生成视频URL
function encodeVideoUrl(row) {
  // 假设 category 字段和目录名一致
  const category = row.category || guessCategoryFromPath(row.file_path);
  return `/${category}/${encodeURIComponent(row.file_name)}`;
}
function guessCategoryFromPath(filePath) {
  if (!filePath) return 'videos';
  if (filePath.includes('videos1')) return 'videos1';
  if (filePath.includes('videos2')) return 'videos2';
  return 'videos';
}

// 数据库初始化函数
async function initializeDatabase() {
  // 步骤1：用不带 database 的连接检查/创建数据库
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '140027'
  });

  try {
    console.log('正在检查数据库...');
    // 检查数据库是否存在
    const [databases] = await connection.execute('SHOW DATABASES LIKE "FavouriteLove"');
    if (databases.length === 0) {
      console.log('数据库不存在，正在创建 FavouriteLove 数据库...');
      await connection.execute('CREATE DATABASE FavouriteLove');
      console.log('数据库创建成功！');
    } else {
      console.log('数据库已存在');
    }
    await connection.end();
  } catch (error) {
    console.error('数据库初始化失败:', error);
    await connection.end();
    throw error;
  }

  // 步骤2：用带 database 的连接检查/创建表
  const dbConn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '140027',
    database: 'FavouriteLove'
  });
  try {
    // 检查 videos 表是否存在
    const [tables] = await dbConn.execute('SHOW TABLES LIKE "videos"');
    if (tables.length === 0) {
      console.log('数据表不存在，正在创建 videos 表...');
      await dbConn.execute(`
        CREATE TABLE videos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          file_path VARCHAR(255) NOT NULL,
          file_name VARCHAR(255),
          like_count INT DEFAULT 0,
          comment_count INT DEFAULT 0,
          uploader VARCHAR(100),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('数据表创建成功！');
    } else {
      console.log('数据表已存在');
    }

    // 检查 danmaku 表是否存在
    const [danmakuTables] = await dbConn.execute('SHOW TABLES LIKE "danmaku"');
    if (danmakuTables.length === 0) {
      console.log('danmaku 表不存在，正在创建 danmaku 表...');
      await dbConn.execute(`
        CREATE TABLE danmaku (
          id INT AUTO_INCREMENT PRIMARY KEY,
          video_id INT NOT NULL,
          content VARCHAR(255) NOT NULL,
          time FLOAT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('danmaku 表创建成功！');
    } else {
      console.log('danmaku 表已存在');
    }

    await dbConn.end();
    console.log('数据库初始化完成！');
  } catch (error) {
    console.error('数据库初始化失败:', error);
    await dbConn.end();
    throw error;
  }
}

// 创建数据库连接池
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '140027', // 修改为你的实际密码
  database: 'FavouriteLove',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 自动同步本地视频到数据库
async function syncVideosToDatabase() {
  const allFiles = [];
  Object.entries(VIDEO_DIRS).forEach(([category, dirPath]) => {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.mp4'))
        .forEach(file => {
          allFiles.push({
            title: file.replace(/.mp4$/, ''),
            file_path: dirPath.replace(/\\/g, '/'),
            file_name: file,
            category
          });
        });
    }
  });

  // 查询数据库已存在的 file_name
  try {
    const [rows] = await pool.query('SELECT file_name FROM videos');
    const dbFileNames = new Set(rows.map(r => r.file_name));
    // 找出本地有但数据库没有的
    const toInsert = allFiles.filter(f => !dbFileNames.has(f.file_name));
    if (toInsert.length === 0) {
      console.log('数据库与本地视频已同步，无需插入。');
      return;
    }
    for (const f of toInsert) {
      await pool.query(
        'INSERT INTO videos (title, description, file_path, file_name, like_count, comment_count, uploader) VALUES (?, ?, ?, ?, 0, 0, ?)',
        [f.title, '', f.file_path, f.file_name, '']
      );
      console.log(`已插入新视频到数据库: ${f.file_name}`);
    }
    console.log(`共插入新视频 ${toInsert.length} 个。`);
  } catch (err) {
    console.error('同步本地视频到数据库失败:', err);
  }
}

// 初始化数据库并同步视频
async function initializeAndSync() {
  try {
    await initializeDatabase();
    await syncVideosToDatabase();
  } catch (err) {
    console.error('数据库初始化或同步失败:', err);
  }
}

// 在 app.listen 前调用
initializeAndSync();

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