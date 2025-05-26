const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const NodeCache = require('node-cache');

const app = express();
const PORT = 3001;
const HOST = '0.0.0.0';

// Initialize cache with 1 hour TTL
const videoCache = new NodeCache({ stdTTL: 3600 });
const videoListCache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache for video lists

// Configure CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Cache-Control']
}));

app.use(express.json());

// Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Define video directories
const videoDirs = ['videos', 'videos1', 'videos2'];

// Cache middleware
const cacheControl = (req, res, next) => {
  res.set({
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD',
  });
  next();
};

// Optimized video streaming with caching
const streamVideo = async (req, res, videoPath) => {
  try {
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Check if video chunk is in cache
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
      const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1000000, fileSize - 1); // Limit chunk size to 1MB
      const chunksize = (end - start) + 1;

      const headers = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };

      res.writeHead(206, headers);
      const videoStream = fs.createReadStream(videoPath, { start, end });
      
      // Cache the chunk if it's small enough (< 5MB)
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
    console.error('Error streaming video:', error);
    res.status(500).send('Error streaming video');
  }
};

// Serve videos with optimized streaming
videoDirs.forEach(dir => {
  app.get(`/${dir}/:filename`, cacheControl, (req, res) => {
    const videoPath = path.join(__dirname, dir, req.params.filename);
    if (fs.existsSync(videoPath)) {
      streamVideo(req, res, videoPath);
    } else {
      res.status(404).send('Video not found');
    }
  });
});

// Get list of available videos with caching
app.get('/api/videos', (req, res) => {
  try {
    // Check cache first
    const cachedVideos = videoListCache.get('allVideos');
    if (cachedVideos) {
      return res.json(cachedVideos);
    }

    let allVideos = [];
    let videoIndex = 1;

    videoDirs.forEach(dir => {
      const videosDir = path.join(__dirname, dir);
      if (fs.existsSync(videosDir)) {
        const files = fs.readdirSync(videosDir)
          .filter(file => file.endsWith('.mp4'))
          .sort((a, b) => {
            const statA = fs.statSync(path.join(videosDir, a));
            const statB = fs.statSync(path.join(videosDir, b));
            return statB.mtime.getTime() - statA.mtime.getTime();
          });

        const videos = files.map(file => ({
          id: videoIndex++,
          url: `/${dir}/${encodeURIComponent(file)}`,
          title: file.replace('.mp4', ''),
          likes: Math.floor(Math.random() * 1000),
          category: dir
        }));
        allVideos = allVideos.concat(videos);
      }
    });

    // Cache the results
    videoListCache.set('allVideos', allVideos);
    console.log(`Total videos found: ${allVideos.length}`);
    res.json(allVideos);
  } catch (error) {
    console.error('Error reading videos directories:', error);
    res.status(500).json({ error: 'Failed to read videos', details: error.message });
  }
});

// Get videos by category with caching
app.get('/api/videos/:category', (req, res) => {
  const category = req.params.category;
  
  try {
    // Check cache first
    const cacheKey = `category-${category}`;
    const cachedVideos = videoListCache.get(cacheKey);
    if (cachedVideos) {
      return res.json(cachedVideos);
    }

    if (category === 'all') {
      return app.handle(req, res);
    }

    if (!videoDirs.includes(category)) {
      throw new Error('Invalid category');
    }

    const videosDir = path.join(__dirname, category);
    if (!fs.existsSync(videosDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(videosDir)
      .filter(file => file.endsWith('.mp4'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(videosDir, a));
        const statB = fs.statSync(path.join(videosDir, b));
        return statB.mtime.getTime() - statA.mtime.getTime();
      });

    const videos = files.map((file, index) => ({
      id: index + 1,
      url: `/${category}/${encodeURIComponent(file)}`,
      title: file.replace('.mp4', ''),
      likes: Math.floor(Math.random() * 1000),
      category
    }));

    // Cache the results
    videoListCache.set(cacheKey, videos);
    res.json(videos);
  } catch (error) {
    console.error(`Error reading ${category} directory:`, error);
    res.status(500).json({ error: `Failed to read ${category}`, details: error.message });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log('Local network access:');
  require('os').networkInterfaces()['WLAN']?.forEach(details => {
    if (details.family === 'IPv4') {
      console.log(`http://${details.address}:${PORT}`);
    }
  });
  
  // Log available videos in each directory
  videoDirs.forEach(dir => {
    const videosDir = path.join(__dirname, dir);
    try {
      if (fs.existsSync(videosDir)) {
        const files = fs.readdirSync(videosDir);
        console.log(`Videos in ${dir}:`, files);
      } else {
        console.log(`Directory ${dir} does not exist`);
      }
    } catch (error) {
      console.error(`Error reading ${dir} directory:`, error);
    }
  });
}); 