import { useState, useEffect, useRef } from 'react';
import { Box, IconButton, Typography, CircularProgress, Switch, FormControlLabel, Slider, Button } from '@mui/material';
import { Favorite, FavoriteBorder, PlayArrow, Pause, Shuffle, PlayCircle } from '@mui/icons-material';
import axios from 'axios';

interface Video {
  id: number;
  url: string;
  title: string;
  likes: number;
  category: string;
}

interface VideoFeedProps {
  selectedCategory: string;
  isDebugMode: boolean;
}

const API_BASE_URL = 'http://192.168.104.88:3001';

// Number of videos to preload
const PRELOAD_COUNT = 3;

const VideoFeed = ({ selectedCategory, isDebugMode }: VideoFeedProps) => {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [watchHistory, setWatchHistory] = useState<number[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [likedVideos, setLikedVideos] = useState<Set<number>>(new Set());
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [isRandomPlay, setIsRandomPlay] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [touchFeedback, setTouchFeedback] = useState<string>('');
  
  const [primaryQueue, setPrimaryQueue] = useState<number[]>([]);
  const [secondaryQueue, setSecondaryQueue] = useState<number[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const QUEUE_SIZE = 5;
  
  const autoPlayAttemptRef = useRef<number>(0);
  const maxAutoPlayAttempts = 3;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const preloadRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // 新增：性能监控状态
  const [loadTime, setLoadTime] = useState<number>(0);
  const [bufferLevel, setBufferLevel] = useState<number>(0);
  const [lastLoadStart, setLastLoadStart] = useState<number>(0);

  useEffect(() => {
    // 页面加载时清空历史记录
    localStorage.removeItem('watchHistory');
    localStorage.removeItem('currentIndex'); // 也清除旧的当前索引
    setWatchHistory([]);
    setHistoryIndex(-1);
    console.log("页面加载：历史记录已清空。");

    const fetchVideos = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get(
          selectedCategory === 'all'
            ? `${API_BASE_URL}/api/videos`
            : `${API_BASE_URL}/api/videos/${selectedCategory}`
        );
        const fetchedVideos = response.data;
        setVideos(fetchedVideos);

        // 刷新后随机定位视频
        if (fetchedVideos.length > 0) {
          const randomIndex = Math.floor(Math.random() * fetchedVideos.length);
          setCurrentVideoIndex(randomIndex);
          console.log(`页面加载：随机定位到视频索引 ${randomIndex}`);
        } else {
          setCurrentVideoIndex(0);
        }

      } catch (error) {
        console.error('Error fetching videos:', error);
        setError('Error fetching videos');
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [selectedCategory]);

  // 保存观看历史到localStorage
  useEffect(() => {
    if (watchHistory.length > 0) {
      localStorage.setItem(`watchHistory_${selectedCategory}`, JSON.stringify(watchHistory));
      localStorage.setItem(`currentIndex_${selectedCategory}`, currentVideoIndex.toString());
    }
  }, [watchHistory, currentVideoIndex, selectedCategory]);

  // 添加视频到观看历史
  const addToHistory = (videoIndex: number) => {
    // 避免将同一个视频连续添加到历史记录中
    if (watchHistory.length > 0 && watchHistory[watchHistory.length - 1] === videoIndex) {
      return;
    }

    setWatchHistory(prev => {
      const newHistory = [...prev, videoIndex];
      // 限制历史记录长度，避免内存占用过大
      if (newHistory.length > 100) {
        newHistory.shift();
      }
      return newHistory;
    });

    // 每次添加新历史时，重置历史导航索引
    setHistoryIndex(-1);
  };

  // 从历史记录中获取上一个视频
  const getPreviousFromHistory = () => {
    if (watchHistory.length === 0) {
      return null;
    }

    // 如果当前不在历史记录中浏览，从最后一个历史记录开始
    if (historyIndex === -1) {
      const lastWatchedIndex = watchHistory[watchHistory.length - 1];
      setHistoryIndex(watchHistory.length - 1);
      return lastWatchedIndex;
    }

    // 如果已经在历史记录中，继续向前浏览
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      return watchHistory[prevIndex];
    }

    // 已经到达历史记录的最开始
    return null;
  };

  // Initialize preload refs
  useEffect(() => {
    preloadRefs.current = Array(PRELOAD_COUNT).fill(null);
  }, []);

  // Enhanced preload logic
  useEffect(() => {
    const preloadVideos = () => {
      for (let i = 0; i < PRELOAD_COUNT; i++) {
        const nextIndex = (currentVideoIndex + i + 1) % videos.length;
        const preloadVideo = preloadRefs.current[i];
        
        if (preloadVideo && videos[nextIndex]) {
          preloadVideo.src = `${API_BASE_URL}${videos[nextIndex].url}`;
          // Set to lowest quality for initial load
          preloadVideo.preload = "metadata";
          
          // Load video data
          preloadVideo.load();
          
          // Start buffering a small portion
          const handleCanPlay = () => {
            if (preloadVideo.buffered.length === 0) return;
            // Buffer first 5 seconds
            if (preloadVideo.buffered.end(0) < 5) {
              preloadVideo.currentTime = 5;
            }
            preloadVideo.removeEventListener('canplay', handleCanPlay);
          };
          
          preloadVideo.addEventListener('canplay', handleCanPlay);
        }
      }
    };

    if (videos.length > 0) {
      preloadVideos();
    }

    return () => {
      // Cleanup preloaded videos
      preloadRefs.current.forEach(video => {
        if (video) {
          video.removeAttribute('src');
          video.load();
        }
      });
    };
  }, [currentVideoIndex, videos]);

  // Add buffering detection
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleCanPlay = () => {
      setIsBuffering(false);
      setIsVideoReady(true);
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('canplay', handleCanPlay);

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('canplay', handleCanPlay);
    };
  }, [currentVideoIndex]);

  // Add control visibility handlers
  const showControlsTemporarily = () => {
    setShowControls(true);
    
    // Clear any existing timeout
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }

    // Set new timeout to hide side panel only
    if (isPlaying) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Enhanced auto-play handling
  const attemptAutoPlay = async () => {
    const video = videoRef.current;
    if (!video || !autoPlay || autoPlayAttemptRef.current >= maxAutoPlayAttempts) return;

    try {
      autoPlayAttemptRef.current += 1;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        await playPromise;
        setIsPlaying(true);
        autoPlayAttemptRef.current = 0; // Reset counter on success
      }
    } catch (error) {
      console.error('Auto-play failed:', error);
      // If auto-play fails, try again with muted video
      if (autoPlayAttemptRef.current < maxAutoPlayAttempts) {
        video.muted = true;
        attemptAutoPlay();
      }
    }
  };

  // Reset auto-play attempt counter when video changes
  useEffect(() => {
    autoPlayAttemptRef.current = 0;
    setIsVideoReady(false);
  }, [currentVideoIndex]);

  // Handle video metadata loaded
  const handleVideoMetadata = () => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      setIsVideoReady(true);
      
      // 性能监控：记录加载时间
      const currentTime = Date.now();
      if (lastLoadStart > 0) {
        setLoadTime(currentTime - lastLoadStart);
      }
    }
  };

  // Enhanced video ready state handling
  useEffect(() => {
    if (isVideoReady && autoPlay) {
      attemptAutoPlay();
    }
  }, [isVideoReady, autoPlay]);

  // Handle video end with enhanced auto-play
  const handleVideoEnd = () => {
    if (autoPlay) {
      const nextIndex = getNextVideoIndex();
      addToHistory(currentVideoIndex);
      setCurrentVideoIndex(nextIndex);
      // 预加载下一个视频
      setTimeout(() => preloadNextVideo(), 100);
    }
  };

  // Handle play state changes - only affect side panel
  useEffect(() => {
    if (isPlaying) {
      showControlsTemporarily();
    } else {
      // 暂停时显示侧边面板，但不影响底部面板
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        window.clearTimeout(controlsTimeoutRef.current);
      }
    }
  }, [isPlaying]);

  // Preload next video
  const preloadNextVideo = () => {
    if (videos.length === 0) return;

    // 根据播放模式智能预加载
    let nextIndex: number;
    
    if (!isRandomPlay) {
      // 顺序播放：预加载下一个视频
      nextIndex = (currentVideoIndex + 1) % videos.length;
    } else {
      // 随机播放：根据当前状态预加载
      if (queueIndex < QUEUE_SIZE - 1) {
        // 顺序播放阶段：预加载下一个顺序视频
        nextIndex = currentVideoIndex + 1;
        if (nextIndex >= videos.length) nextIndex = 0;
      } else {
        // 准备生成新队列：预加载第一个视频（通常是0）
        nextIndex = 0;
      }
    }

    // 预加载下一个视频
    if (preloadRefs.current[nextIndex]) {
      const video = preloadRefs.current[nextIndex];
      if (video && video.readyState < 2) { // HAVE_CURRENT_DATA
        video.load();
        console.log(`预加载视频 ${nextIndex}: ${videos[nextIndex]?.title}`);
      }
    }

    // 额外预加载：在顺序播放阶段，预加载接下来的2-3个视频
    if (!isRandomPlay || queueIndex < QUEUE_SIZE - 2) {
      for (let i = 1; i <= 2; i++) {
        const futureIndex = (nextIndex + i) % videos.length;
        if (preloadRefs.current[futureIndex]) {
          const video = preloadRefs.current[futureIndex];
          if (video && video.readyState < 2) {
            video.load();
            console.log(`额外预加载视频 ${futureIndex}: ${videos[futureIndex]?.title}`);
          }
        }
      }
    }
  };

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getNextVideoIndex = () => {
    if (!isRandomPlay) {
      return (currentVideoIndex + 1) % videos.length;
    }

    // 如果主队列为空，则强制重新初始化
    if (primaryQueue.length === 0) {
      console.warn("主队列为空，正在重新生成...");
      const newPrimary = generateRandomVideoQueue();
      const newSecondary = generateRandomVideoQueue(new Set(newPrimary));
      setPrimaryQueue(newPrimary);
      setSecondaryQueue(newSecondary);
      setQueueIndex(0);
      return newPrimary[0];
    }

    const nextQueueIndex = queueIndex + 1;

    // 如果主队列中还有视频，则播放下一个
    if (nextQueueIndex < primaryQueue.length) {
      setQueueIndex(nextQueueIndex);
      const nextVideo = primaryQueue[nextQueueIndex];
      console.log(`播放主队列下一个视频: ${nextVideo} (位置: ${nextQueueIndex + 1}/${QUEUE_SIZE})`);
      return nextVideo;
    }

    // 主队列播放完毕，启用备用队列，并生成新的备用队列
    console.log("主队列播放完毕，启用备用队列...");
    const newPrimary = secondaryQueue;
    const newSecondary = generateRandomVideoQueue(new Set(newPrimary));

    setPrimaryQueue(newPrimary);
    setSecondaryQueue(newSecondary);
    setQueueIndex(0);
    
    console.log('新主队列:', newPrimary);
    console.log('新备用队列:', newSecondary);

    // 返回新主队列的第一个视频
    return newPrimary[0];
  };

  // 生成随机视频队列，可以传入需要排除的索引
  const generateRandomVideoQueue = (excludeIndices: Set<number> = new Set()) => {
    const queue: number[] = [];
    const usedIndices = new Set(excludeIndices);
    usedIndices.add(currentVideoIndex); // 总是排除当前视频

    // 如果可选的视频太少，就允许重复
    const availableVideos = videos.length - usedIndices.size;
    if (availableVideos < QUEUE_SIZE) {
      console.warn("可用视频不足，允许在队列中出现重复");
      usedIndices.clear();
      usedIndices.add(currentVideoIndex);
    }
    
    while (queue.length < QUEUE_SIZE) {
      const randomIndex = Math.floor(Math.random() * videos.length);
      if (!usedIndices.has(randomIndex)) {
        queue.push(randomIndex);
        usedIndices.add(randomIndex);
      } else if (queue.length + availableVideos < QUEUE_SIZE) {
        // 如果唯一视频不够，就从头开始允许重复
        queue.push(randomIndex);
      }
    }
    
    return queue;
  };

  // 初始化或重置随机播放队列
  useEffect(() => {
    if (isRandomPlay && videos.length > 0) {
      if (primaryQueue.length === 0) { // 只在主队列为空时初始化
        console.log("初始化主、备队列...");
        const initialPrimary = generateRandomVideoQueue();
        const initialSecondary = generateRandomVideoQueue(new Set(initialPrimary));
        
        setPrimaryQueue(initialPrimary);
        setSecondaryQueue(initialSecondary);
        setQueueIndex(0);

        console.log('主队列:', initialPrimary);
        console.log('备用队列:', initialSecondary);
      }
    } else {
      // 关闭随机播放时清空队列
      setPrimaryQueue([]);
      setSecondaryQueue([]);
    }
  }, [isRandomPlay, videos.length]);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Video playback error:', e);
    setError('Error playing video');
  };

  const toggleLike = (videoId: number) => {
    const newLikedVideos = new Set(likedVideos);
    if (likedVideos.has(videoId)) {
      newLikedVideos.delete(videoId);
    } else {
      newLikedVideos.add(videoId);
    }
    setLikedVideos(newLikedVideos);
  };

  // 阻止浏览器下拉刷新（简化版本）
  useEffect(() => {
    const preventPullToRefresh = (e: TouchEvent) => {
      // 只在特定情况下阻止
      if (e.target === document.body || e.target === document.documentElement) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventPullToRefresh, { passive: false });
    
    return () => {
      document.removeEventListener('touchmove', preventPullToRefresh);
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    setTouchFeedback('');
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;

    // 增加最小滑动距离，避免误触
    if (Math.abs(deltaY) > 80) {
      if (deltaY < 0) {
        // Swipe up - next video (记录上一个视频，然后切换到下一个)
        const nextIndex = getNextVideoIndex();
        let playModeText = '顺序下一个视频';
        
        if (isRandomPlay) {
          playModeText = `队列播放 (${queueIndex + 1}/${QUEUE_SIZE})`;
          if (queueIndex >= QUEUE_SIZE - 1) {
            playModeText += ' - 切换队列';
          }
        }
        
        // 仅在调试模式下显示触摸反馈
        if (isDebugMode) {
          setTouchFeedback(playModeText);
        }
        
        // 记录当前视频作为历史（这样下滑时就能回到当前视频）
        console.log(`上滑：记录视频${currentVideoIndex}，切换到视频${nextIndex}，播放模式: ${playModeText}`);
        addToHistory(currentVideoIndex);
        setCurrentVideoIndex(nextIndex);
      } else if (deltaY > 0) {
        // Swipe down - 依次显示历史视频
        const prevIndex = getPreviousFromHistory();
        if (prevIndex !== null) {
          const remainingHistory = historyIndex >= 0 ? historyIndex : watchHistory.length - 1;
          // 仅在调试模式下显示触摸反馈
          if (isDebugMode) {
            setTouchFeedback(`上一个视频 (还有${remainingHistory}个历史)`);
          }
          console.log(`下滑：回到视频${prevIndex}，剩余历史: ${remainingHistory}个`);
          setCurrentVideoIndex(prevIndex);
          // 重要：当从历史记录回到某个视频时，不要重置队列
          // 让用户继续使用当前的队列，只是调整位置
          if (isRandomPlay) {
            // 不清空队列，保持当前队列状态
            // 只是将队列位置重置到开始，这样用户继续向前时会按顺序播放
            setQueueIndex(0);
            console.log('从历史记录返回，保持当前队列，重置位置到开始');
          }
        } else {
          // 仅在调试模式下显示触摸反馈
          if (isDebugMode) {
            setTouchFeedback('没有更多历史');
          }
          console.log('下滑：没有更多历史记录');
        }
      }
      
      // 清除反馈信息
      setTimeout(() => {
        setTouchFeedback('');
      }, 1000);
    }
  };

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const resetHistory = () => {
    setWatchHistory([]);
    setHistoryIndex(-1);
    // 重置历史记录，但不清空队列
    // 这样用户可以继续使用当前的随机播放队列
    localStorage.removeItem('watchHistory');
    console.log('历史记录已重置，但保持当前队列');
  };

  // 切换底部面板显示
  const toggleBottomPanel = () => {
    setShowBottomPanel(!showBottomPanel);
  };

  // 当视频索引改变时预加载下一个视频
  useEffect(() => {
    if (videos.length > 0) {
      preloadNextVideo();
    }
  }, [currentVideoIndex, videos, isRandomPlay, queueIndex, primaryQueue]);

  // 监控缓冲状态
  const handleProgress = () => {
    const video = videoRef.current;
    if (video && video.buffered.length > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      const currentTime = video.currentTime;
      setBufferLevel(bufferedEnd - currentTime);
    }
  };

  // 记录加载开始时间
  const handleLoadStart = () => {
    setLastLoadStart(Date.now());
  };

  // 视频事件处理函数
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (video && video.duration > 0) {
      setProgress((video.currentTime / video.duration) * 100);
    }
  };

  const handleWaiting = () => setIsBuffering(true);
  const handlePlaying = () => setIsBuffering(false);
  const handleCanPlay = () => {
    setIsBuffering(false);
    setIsVideoReady(true);
  };

  // Add progress bar change handler
  const handleProgressChange = (_event: Event, newValue: number | number[]) => {
    if (videoRef.current && typeof newValue === 'number') {
      const time = (newValue / 100) * duration;
      videoRef.current.currentTime = time;
      setProgress(newValue);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'error.main',
        }}
      >
        <Typography variant="h6">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: '100vh',
        bgcolor: 'black',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          maxWidth: '500px',
          height: '100vh',
          position: 'relative',
          bgcolor: 'black',
          overflow: 'hidden',
          touchAction: 'none',
          cursor: showControls ? 'auto' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overscrollBehavior: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={showControlsTemporarily}
        onMouseMove={showControlsTemporarily}
      >
        {videos.length > 0 ? (
          <>
            <video
              ref={videoRef}
              key={videos[currentVideoIndex].id}
              className="video-player"
              src={`${API_BASE_URL}${videos[currentVideoIndex].url}`}
              loop={false}
              playsInline
              preload="auto"
              style={{
                backgroundColor: 'black',
                borderRadius: '12px',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
              onLoadStart={handleLoadStart}
              onProgress={handleProgress}
              onLoadedMetadata={handleVideoMetadata}
              onEnded={handleVideoEnd}
              onError={handleVideoError}
              onTimeUpdate={handleTimeUpdate}
              onWaiting={handleWaiting}
              onPlaying={handlePlaying}
              onCanPlay={handleCanPlay}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onClick={togglePlayPause}
            />

            {/* Preload videos */}
            {Array(PRELOAD_COUNT).fill(null).map((_, index) => (
              <video
                key={`preload-${index}`}
                ref={(el: HTMLVideoElement | null) => {
                  if (preloadRefs.current) {
                    preloadRefs.current[index] = el;
                  }
                }}
                style={{ display: 'none' }}
                preload="metadata"
                playsInline
              />
            ))}

            {/* Loading indicator */}
            {isBuffering && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.5)',
                  borderRadius: '50%',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10,
                }}
              >
                <CircularProgress sx={{ color: '#ff4081' }} />
              </Box>
            )}

            {/* Touch feedback - 仅在调试模式下显示 */}
            {isDebugMode && touchFeedback && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: 'white',
                  padding: '12px 20px',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  zIndex: 25,
                  pointerEvents: 'none',
                  animation: 'fadeInOut 1.5s ease-in-out',
                  '@keyframes fadeInOut': {
                    '0%': { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' },
                    '20%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
                    '80%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
                    '100%': { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' },
                  },
                }}
              >
                {touchFeedback}
              </Box>
            )}

            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                p: 1.5,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.9) 30%)',
                color: 'white',
                opacity: showBottomPanel ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: showBottomPanel ? 'auto' : 'none',
                paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
                minHeight: '120px',
              }}
            >
              <Box sx={{ width: '100%', mb: 0.5 }}>
                <Slider
                  value={progress}
                  onChange={handleProgressChange}
                  sx={{
                    color: '#ff4081',
                    height: 6,
                    '& .MuiSlider-thumb': {
                      width: 12,
                      height: 12,
                      transition: '0.3s cubic-bezier(.47,1.64,.41,.8)',
                      '&:hover, &.Mui-focusVisible': {
                        boxShadow: '0px 0px 0px 8px rgba(255, 64, 129, 0.16)',
                      },
                      '&.Mui-active': {
                        width: 16,
                        height: 16,
                      },
                    },
                    '& .MuiSlider-rail': {
                      opacity: 0.28,
                    },
                  }}
                />
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  mt: -0.5,
                  fontSize: '0.8rem',
                  opacity: 0.8
                }}>
                  <span>{formatTime(videoRef.current?.currentTime || 0)}</span>
                  <span>{formatTime(duration)}</span>
                </Box>
              </Box>
              
              <Typography 
                variant="h6" 
                sx={{ 
                  textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  fontSize: '1rem',
                  mb: 0.5
                }}
              >
                {videos[currentVideoIndex].title}
                {isDebugMode && watchHistory.length > 0 && (
                  <Typography variant="body2" sx={{ 
                    color: historyIndex >= 0 ? '#ff4081' : '#4CAF50',
                    backgroundColor: historyIndex >= 0 ? 'rgba(255, 64, 129, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                    fontSize: '0.7rem',
                    ml: 1,
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                  >
                    {historyIndex >= 0 
                      ? `历史浏览 (${historyIndex + 1}/${watchHistory.length})`
                      : `历史记录 (${watchHistory.length}个)`
                    }
                  </Typography>
                )}
              </Typography>
              
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1.5,
                flexWrap: 'wrap'
              }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={autoPlay}
                      onChange={() => setAutoPlay(!autoPlay)}
                      sx={{
                        '& .MuiSwitch-switchBase.Mui-checked': {
                          color: '#ff4081',
                        },
                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                          backgroundColor: '#ff4081',
                        },
                      }}
                    />
                  }
                  label="自动播放"
                  sx={{
                    color: 'white',
                    '& .MuiFormControlLabel-label': {
                      color: 'white',
                      textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                      fontSize: '0.8rem',
                    },
                  }}
                />
                <IconButton
                  onClick={() => setIsRandomPlay(!isRandomPlay)}
                  sx={{ 
                    color: isRandomPlay ? '#ff4081' : 'white',
                    padding: '8px',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    },
                  }}
                >
                  <Shuffle sx={{ fontSize: '1.2rem' }} />
                </IconButton>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={resetHistory}
                  sx={{
                    color: 'white',
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    fontSize: '0.7rem',
                    padding: '4px 8px',
                    minWidth: 'auto',
                    height: '32px',
                    '&:hover': {
                      borderColor: '#ff4081',
                      backgroundColor: 'rgba(255, 64, 129, 0.1)',
                    },
                  }}
                >
                  重置记录 ({watchHistory.length})
                </Button>
                {isDebugMode && (
                  <Typography variant="body2" sx={{ 
                    color: historyIndex >= 0 ? '#ff4081' : '#4CAF50',
                    backgroundColor: historyIndex >= 0 ? 'rgba(255, 64, 129, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                    fontSize: '0.7rem',
                    ml: 1,
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                  >
                    历史位置: {historyIndex >= 0 ? historyIndex : '无'}
                  </Typography>
                )}
                {isDebugMode && (
                  <Typography variant="body2" sx={{ 
                    color: watchHistory.length > 0 ? '#4CAF50' : 'rgba(255, 255, 255, 0.7)',
                    backgroundColor: watchHistory.length > 0 ? 'rgba(76, 175, 80, 0.2)' : 'rgba(0, 0, 0, 0.3)',
                    fontSize: '0.7rem',
                    ml: 1,
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                  >
                    历史浏览: {watchHistory.length > 0 ? `${watchHistory.length}个视频` : '无'}
                  </Typography>
                )}
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1, 
                  ml: 'auto',
                  flexShrink: 0
                }}>
                  <IconButton
                    color="primary"
                    onClick={togglePlayPause}
                    sx={{ 
                      color: 'white',
                      padding: '8px',
                    }}
                  >
                    {isPlaying ? <Pause sx={{ fontSize: '1.2rem' }} /> : <PlayArrow sx={{ fontSize: '1.2rem' }} />}
                  </IconButton>
                  <IconButton
                    color="primary"
                    onClick={() => toggleLike(videos[currentVideoIndex].id)}
                    sx={{ 
                      padding: '8px',
                    }}
                  >
                    {likedVideos.has(videos[currentVideoIndex].id) ? (
                      <Favorite sx={{ color: '#ff4081', fontSize: '1.2rem' }} />
                    ) : (
                      <FavoriteBorder sx={{ color: 'white', fontSize: '1.2rem' }} />
                    )}
                  </IconButton>
                  <Typography variant="body2" sx={{ 
                    color: 'white',
                    fontSize: '0.8rem',
                    minWidth: '20px',
                    textAlign: 'center'
                  }}>
                    {videos[currentVideoIndex].likes}
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Floating side control panel */}
            <Box
              sx={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                zIndex: 20,
                opacity: showControls ? 1 : 0.3,
                transition: 'opacity 0.3s ease-in-out',
              }}
            >
              <IconButton
                onClick={togglePlayPause}
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  width: '48px',
                  height: '48px',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  },
                }}
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? <Pause /> : <PlayArrow />}
              </IconButton>

              <IconButton
                onClick={() => setAutoPlay(!autoPlay)}
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: autoPlay ? '#ff4081' : 'white',
                  width: '48px',
                  height: '48px',
                  border: autoPlay ? '2px solid #ff4081' : '2px solid transparent',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  },
                }}
                title={autoPlay ? '自动播放已开启' : '自动播放已关闭'}
              >
                <PlayCircle />
              </IconButton>
              
              <IconButton
                onClick={() => toggleLike(videos[currentVideoIndex].id)}
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: likedVideos.has(videos[currentVideoIndex].id) ? '#ff4081' : 'white',
                  width: '48px',
                  height: '48px',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  },
                }}
                title={likedVideos.has(videos[currentVideoIndex].id) ? '取消点赞' : '点赞'}
              >
                {likedVideos.has(videos[currentVideoIndex].id) ? <Favorite /> : <FavoriteBorder />}
              </IconButton>
              
              <IconButton
                onClick={() => setIsRandomPlay(!isRandomPlay)}
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: isRandomPlay ? '#ff4081' : 'white',
                  width: '48px',
                  height: '48px',
                  border: isRandomPlay ? '2px solid #ff4081' : '2px solid transparent',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  },
                }}
                title={isRandomPlay ? '随机播放已开启' : '随机播放已关闭'}
              >
                <Shuffle />
              </IconButton>

              <IconButton
                onClick={resetHistory}
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  width: '48px',
                  height: '48px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  },
                }}
                title="重置观看历史"
              >
                重置
              </IconButton>

              <IconButton
                onClick={toggleBottomPanel}
                sx={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  color: 'white',
                  width: '48px',
                  height: '48px',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  },
                }}
                title={showBottomPanel ? '隐藏底部面板' : '显示底部面板'}
              >
                {showBottomPanel ? '▼' : '▲'}
              </IconButton>
            </Box>

            {/* Debug info - 仅在调试模式下显示 */}
            {isDebugMode && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '70px',
                  left: '10px',
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: 'white',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  zIndex: 30,
                  maxWidth: '350px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#ff4081' }}>
                  🐞 调试信息面板
                </div>
                <div style={{ marginBottom: '4px' }}>
                  📹 <strong>当前视频:</strong> {currentVideoIndex} / {videos.length - 1}
                </div>
                <div style={{ marginBottom: '4px' }}>
                  🎮 <strong>播放模式:</strong> {isRandomPlay ? '随机播放' : '顺序播放'}
                </div>
                {isRandomPlay && (
                  <>
                    <div style={{ marginBottom: '4px' }}>
                      📊 <strong>队列位置:</strong> {queueIndex + 1}/{QUEUE_SIZE}
                    </div>
                    {primaryQueue.length > 0 && (
                      <div style={{ marginBottom: '4px', fontSize: '11px', color: '#4CAF50' }}>
                        PRIMARY: [{primaryQueue.join(', ')}]
                      </div>
                    )}
                    {secondaryQueue.length > 0 && (
                      <div style={{ marginBottom: '4px', fontSize: '11px', color: '#FF9800' }}>
                        SECONDARY: [{secondaryQueue.join(', ')}]
                      </div>
                    )}
                    <div style={{ marginBottom: '4px' }}>
                      🎯 <strong>下一个视频:</strong> {(() => {
                        const nextIdx = queueIndex + 1;
                        if (nextIdx < primaryQueue.length) {
                          return primaryQueue[nextIdx];
                        }
                        if (secondaryQueue.length > 0) {
                          return secondaryQueue[0];
                        }
                        return '待生成';
                      })()}
                    </div>
                  </>
                )}
                <div style={{ marginBottom: '4px' }}>
                  📚 <strong>历史记录:</strong> {watchHistory.length}个视频
                </div>
                <div style={{ marginBottom: '4px' }}>
                  📍 <strong>历史位置:</strong> {historyIndex >= 0 ? historyIndex : '无'}
                </div>
                <div style={{ marginBottom: '4px' }}>
                  ⏱️ <strong>加载时间:</strong> {loadTime}ms
                </div>
                <div style={{ marginBottom: '4px' }}>
                  📦 <strong>缓冲级别:</strong> {bufferLevel.toFixed(1)}s
                </div>
                <div style={{ marginBottom: '4px' }}>
                  ✅ <strong>视频就绪:</strong> {isVideoReady ? '是' : '否'}
                </div>
              </Box>
            )}
          </>
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
            }}
          >
            <Typography variant="h6">
              {loading ? '加载中...' : '该分类下暂无视频'}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default VideoFeed;