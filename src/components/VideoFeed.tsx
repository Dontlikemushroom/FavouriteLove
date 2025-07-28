import { useState, useEffect, useRef } from 'react';
import { Box, IconButton, Typography, CircularProgress, Switch, FormControlLabel, Slider, Button } from '@mui/material';
import { Favorite, FavoriteBorder, Shuffle, PlayCircle, Download, PlayArrow } from '@mui/icons-material';
import axios from 'axios';
import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import EditNoteIcon from '@mui/icons-material/EditNote';

interface Video {
  id: number;
  url: string;
  title: string;
  likes: number;
  category: string;
  file_name?: string;
}

interface VideoFeedProps {
  selectedCategory: string;
  isDebugMode: boolean;
  selectedVideo?: Video | null;
  onVideoSelect?: (video: Video) => void;
  searchResults?: Video[]; // 新增：搜索结果
  isSearchMode?: boolean;  // 新增：是否处于搜索模式
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Number of videos to preload
const PRELOAD_COUNT = 3;

const VideoFeed = ({ selectedCategory, isDebugMode, selectedVideo, onVideoSelect, searchResults, isSearchMode }: VideoFeedProps) => {
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

  // 新增：记录本轮已播过的视频 index
  const [playedSet, setPlayedSet] = useState<Set<number>>(new Set());

  // 判断是否为微信浏览器
  const isWeChatBrowser = /micromessenger/i.test(navigator.userAgent);

  // 微信浏览器下复制链接弹窗
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const [copyUrl, setCopyUrl] = useState('');

  // 播放按钮动画控制
  const [showCenterPlay, setShowCenterPlay] = useState(false);

  // 2倍速提示
  const [showSpeedTip, setShowSpeedTip] = useState(false);

  // 长按判定定时器
  const longPressTimer = useRef<number | null>(null);

  // ===== 弹幕相关状态 =====
  const [danmakus, setDanmakus] = useState<any[]>([]);
  const [showDanmakuInput, setShowDanmakuInput] = useState(false);
  const [danmakuInput, setDanmakuInput] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [activeDanmakus, setActiveDanmakus] = useState<any[]>([]);
  const DANMAKU_ANIMATION_DURATION = 6; // 弹幕动画时长（秒，调慢）

  // ===== 评论相关状态 =====
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [comments, setComments] = useState<string[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // 新增：编辑标题弹窗状态
  const [showEditTitle, setShowEditTitle] = useState(false);
  const [editTitleInput, setEditTitleInput] = useState('');

  // 新增：编辑文件名弹窗状态
  const [showEditFileName, setShowEditFileName] = useState(false);
  const [editFileNameInput, setEditFileNameInput] = useState('');

  // 保存当前视频状态到localStorage
  const saveCurrentVideoState = () => {
    if (videos.length > 0 && currentVideoIndex >= 0) {
      const currentVideo = videos[currentVideoIndex];
      localStorage.setItem('lastVideoState', JSON.stringify({
        videoId: currentVideo.id,
        fileName: currentVideo.file_name,
        title: currentVideo.title,
        category: currentVideo.category,
        timestamp: Date.now()
      }));
    }
  };

  // 处理从搜索中选中的视频
  useEffect(() => {
    if (selectedVideo && videos.length > 0) {
      const videoIndex = videos.findIndex(video => 
        video.id === selectedVideo.id || 
        video.url === selectedVideo.url ||
        video.file_name === selectedVideo.file_name
      );
      
      if (videoIndex !== -1) {
        setCurrentVideoIndex(videoIndex);
        console.log(`搜索选中视频：定位到索引 ${videoIndex}`);
      }
    }
  }, [selectedVideo, videos]);

  // 处理搜索结果模式
  useEffect(() => {
    if (isSearchMode && searchResults && searchResults.length > 0) {
      // 切换到搜索结果模式
      setVideos(searchResults);
      setCurrentVideoIndex(0);
      console.log(`进入搜索模式：加载 ${searchResults.length} 个搜索结果`);
    }
  }, [isSearchMode, searchResults]);

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
        let response;
        if (selectedCategory === 'top20') {
          response = await axios.get(`${API_BASE_URL}/api/videos/top20`);
        } else if (selectedCategory === 'all') {
          response = await axios.get(`${API_BASE_URL}/api/videos`);
        } else {
          response = await axios.get(`${API_BASE_URL}/api/videos/${selectedCategory}`);
        }
        let fetchedVideos = response.data;
        setVideos(fetchedVideos);

        // 尝试恢复上次的视频状态
        const lastVideoState = localStorage.getItem('lastVideoState');
        if (lastVideoState) {
          try {
            const state = JSON.parse(lastVideoState);
            const videoIndex = fetchedVideos.findIndex((video: Video) => 
              video.id === state.videoId || 
              video.file_name === state.fileName ||
              video.title === state.title
            );
            
            if (videoIndex !== -1) {
              setCurrentVideoIndex(videoIndex);
              console.log(`页面加载：恢复到上次的视频索引 ${videoIndex}`);
              // 清除状态，避免下次加载时重复使用
              localStorage.removeItem('lastVideoState');
            } else {
              // 如果找不到原视频，随机定位
              const randomIndex = Math.floor(Math.random() * fetchedVideos.length);
              setCurrentVideoIndex(randomIndex);
              console.log(`页面加载：随机定位到视频索引 ${randomIndex}`);
            }
          } catch (error) {
            console.error('恢复视频状态失败:', error);
            // 出错时随机定位
            const randomIndex = Math.floor(Math.random() * fetchedVideos.length);
            setCurrentVideoIndex(randomIndex);
            console.log(`页面加载：随机定位到视频索引 ${randomIndex}`);
          }
        } else {
          // 没有保存的状态，随机定位
          if (fetchedVideos.length > 0) {
            const randomIndex = Math.floor(Math.random() * fetchedVideos.length);
            setCurrentVideoIndex(randomIndex);
            console.log(`页面加载：随机定位到视频索引 ${randomIndex}`);
          } else {
            setCurrentVideoIndex(0);
          }
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
    // 合并本轮已播过的和传入的排除集
    const usedIndices = new Set([...playedSet, ...excludeIndices]);
    usedIndices.add(currentVideoIndex); // 总是排除当前视频

    // 只要还有没播过的视频，就不允许重复
    let availableIndices = [];
    for (let i = 0; i < videos.length; i++) {
      if (!usedIndices.has(i)) availableIndices.push(i);
    }

    // 如果可用视频不足队列长度，允许重复（重置 playedSet）
    if (availableIndices.length < QUEUE_SIZE) {
      availableIndices = [];
      for (let i = 0; i < videos.length; i++) {
        if (i !== currentVideoIndex) availableIndices.push(i);
      }
      // 重置已播集合
      setPlayedSet(new Set([currentVideoIndex]));
    }

    while (queue.length < QUEUE_SIZE && availableIndices.length > 0) {
      const idx = Math.floor(Math.random() * availableIndices.length);
      queue.push(availableIndices[idx]);
      availableIndices.splice(idx, 1);
    }

    // 如果队列还不够，允许重复填满
    while (queue.length < QUEUE_SIZE) {
      const randomIndex = Math.floor(Math.random() * videos.length);
      if (randomIndex !== currentVideoIndex) {
        queue.push(randomIndex);
      }
    }
    return queue;
  };

  // 每次切换到新视频时，记录到 playedSet
  useEffect(() => {
    if (isRandomPlay && videos.length > 0) {
      setPlayedSet(prev => {
        const newSet = new Set(prev);
        newSet.add(currentVideoIndex);
        return newSet;
      });
    }
  }, [currentVideoIndex, isRandomPlay, videos.length]);

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    console.error('Video playback error:', e);
    setError('Error playing video');
  };

  const isLiked = (videoId: number) => {
    return sessionStorage.getItem(`liked_video_${videoId}`) === '1';
  };

  const toggleLike = async (videoId: number) => {
    const likedKey = `liked_video_${videoId}`;
    const alreadyLiked = sessionStorage.getItem(likedKey);
    try {
      let response;
      if (alreadyLiked) {
        // 取消点赞
        response = await axios.post(`${API_BASE_URL}/api/videos/${videoId}/unlike`);
        sessionStorage.removeItem(likedKey);
        setLikedVideos(prev => {
          const newSet = new Set(prev);
          newSet.delete(videoId);
          return newSet;
        });
      } else {
        // 点赞
        response = await axios.post(`${API_BASE_URL}/api/videos/${videoId}/like`);
        sessionStorage.setItem(likedKey, '1');
        setLikedVideos(prev => {
          const newSet = new Set(prev);
          newSet.add(videoId);
          return newSet;
        });
      }
      const newLikeCount = response.data.like_count;
      setVideos(prevVideos =>
        prevVideos.map(video =>
          video.id === videoId ? { ...video, likes: newLikeCount } : video
        )
      );
    } catch (error) {
      console.error('点赞/取消点赞失败:', error);
    }
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
      setCurrentTime(video.currentTime);
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

  // 恢复播放/暂停功能
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

  // 关闭复制弹窗
  const closeCopyDialog = () => setShowCopyDialog(false);

  // 在暂停时显示中央播放按钮，播放时隐藏
  useEffect(() => {
    if (!isPlaying) {
      setShowCenterPlay(true);
    } else {
      setShowCenterPlay(false);
    }
  }, [isPlaying]);

  // 长按开始
  const handleLongPressStart = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
    longPressTimer.current = window.setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.playbackRate = 2.0;
        setShowSpeedTip(true);
      }
    }, 400); // 400ms为长按判定时间，可调整
  };
  // 长按结束
  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = 1.0;
    }
    setShowSpeedTip(false);
  };

  // 页面加载或视频列表变化时，同步sessionStorage点赞状态到likedVideos
  useEffect(() => {
    const likedSet = new Set<number>();
    videos.forEach(video => {
      if (sessionStorage.getItem(`liked_video_${video.id}`) === '1') {
        likedSet.add(video.id);
      }
    });
    setLikedVideos(likedSet);
    // eslint-disable-next-line
  }, [videos.length]);

  // 获取弹幕
  useEffect(() => {
    if (!videos[currentVideoIndex]) return;
    axios.get(`${API_BASE_URL}/api/danmaku?videoId=${videos[currentVideoIndex].id}`)
      .then(res => setDanmakus(res.data))
      .catch(() => setDanmakus([]));
  }, [currentVideoIndex, videos]);

  // 弹幕激活与显示时长控制
  useEffect(() => {
    // 只保留当前时间点已出现且未超过动画时长的弹幕
    setActiveDanmakus(prev => {
      // 1. 先保留未到期的弹幕
      const stillActive = Array.isArray(prev) ? prev.filter(d => currentTime - d._appearTime < DANMAKU_ANIMATION_DURATION) : [];
      // 2. 新激活的弹幕
      const newDanmakus = danmakus
        .filter(d =>
          d.time <= currentTime &&
          d.time > currentTime - 0.5 && // 只在刚出现时激活
          !stillActive.some(a => a.id === d.id && a.time === d.time)
        )
        .map(d => ({ ...d, _appearTime: currentTime }));
      return [...stillActive, ...newDanmakus];
    });
  }, [currentTime, danmakus]);

  // 发送弹幕函数
  function sendDanmaku() {
    if (!danmakuInput.trim()) return;
    const video = videos[currentVideoIndex];
    axios.post(`${API_BASE_URL}/api/danmaku`, {
      videoId: video.id,
      content: danmakuInput.trim(),
      time: currentTime
    }).then(res => {
      setDanmakus(prev => [...prev, res.data]);
      setShowDanmakuInput(false);
      setDanmakuInput('');
    }).catch(() => {
      // 可加错误提示
    });
  }

  // 获取评论
  useEffect(() => {
    if (!videos[currentVideoIndex]) return;
    setLoadingComments(true);
    axios.get(`${API_BASE_URL}/api/videos/${videos[currentVideoIndex].id}/comment`)
      .then(res => {
        const arr = (res.data.comments || '').split('\n').filter(Boolean);
        setComments(arr);
      })
      .catch(() => setComments([]))
      .finally(() => setLoadingComments(false));
  }, [currentVideoIndex, videos]);

  // 发送评论
  function sendComment() {
    if (!commentInput.trim()) return;
    const video = videos[currentVideoIndex];
    axios.post(`${API_BASE_URL}/api/videos/${video.id}/comment`, {
      comment: commentInput.trim()
    }).then(() => {
      setComments([commentInput.trim()]); // 覆盖为最新评论
      setCommentInput(''); // 只清空输入，不关闭输入框
    }).catch((err) => {
      alert('评论失败: ' + (err?.response?.data?.error || '网络错误'));
    });
  }

  // 每次切换视频时打印当前 videos 数组
  useEffect(() => {
    if (videos.length > 0) {
      console.log('切换到新视频，当前 videos 数组：', videos);
    }
  }, [currentVideoIndex, videos]);

  // 调试面板视频对象展开/收起状态
  const [showVideoObjDetail, setShowVideoObjDetail] = useState(false);

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
              onTouchStart={handleLongPressStart}
              onTouchEnd={handleLongPressEnd}
              onMouseDown={handleLongPressStart}
              onMouseUp={handleLongPressEnd}
            />

            {/* 中央播放按钮，仅在暂停时显示 */}
            {showCenterPlay && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 30,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  opacity: 0.7,
                  transition: 'opacity 0.3s',
                  background: 'none',
                  borderRadius: '50%',
                  width: 90,
                  height: 90,
                  '@keyframes fadeInScale': {
                    '0%': { opacity: 0, transform: 'translate(-50%, -50%) scale(0.7)' },
                    '100%': { opacity: 0.7, transform: 'translate(-50%, -50%) scale(1)' },
                  },
                  animation: 'fadeInScale 0.3s',
                }}
              >
                <PlayArrow sx={{ fontSize: 80, color: 'white', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }} />
              </Box>
            )}

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

            {/* 2倍速提示 */}
            {showSpeedTip && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '64px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 1201,
                  background: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  px: 2,
                  py: 0.5,
                  borderRadius: '16px',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  letterSpacing: '0.1em',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  border: '1.5px solid #ff4081',
                  opacity: 0.92,
                }}
              >
                2x倍速
              </Box>
            )}

            {/* 在视频标签下方渲染弹幕层 */}
            {videos.length > 0 && (
              <div
                className="danmaku-layer"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  zIndex: 15,
                  overflow: 'hidden',
                }}
              >
                {activeDanmakus.map((d, idx) => (
                  <div
                    key={d.id + '-' + idx}
                    className="danmaku-item"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: `${12 + (idx % 8) * 8}%`,
                      color: 'white',
                      textShadow: '1px 1px 2px black',
                      fontSize: 16,
                      whiteSpace: 'nowrap',
                      transform: 'translateX(100%)',
                      animation: `danmaku-move ${DANMAKU_ANIMATION_DURATION}s linear`,
                      pointerEvents: 'none',
                    }}
                  >
                    {d.content}
                  </div>
                ))}
                <style>{`
                  @keyframes danmaku-move {
                    from { transform: translateX(100%); }
                    to { transform: translateX(-120%); }
                  }
                `}</style>
              </div>
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
                {(videos[currentVideoIndex].file_name || '').replace(/\.mp4$/i, '')}
                {isSearchMode && (
                  <Box component="span" sx={{ 
                    ml: 1, 
                    fontSize: '0.8em', 
                    color: '#ff4081',
                    backgroundColor: 'rgba(255, 64, 129, 0.2)',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    border: '1px solid #ff4081'
                  }}>
                    🔍 搜索结果
                  </Box>
                )}
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
              
              {isDebugMode && (
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
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1, 
                  ml: 'auto',
                  flexShrink: 0
                }}>
                  <IconButton
                    color="primary"
                    onClick={() => {
                      const url = `${API_BASE_URL}${videos[currentVideoIndex].url}`;
                      if (isWeChatBrowser) {
                        setCopyUrl(url);
                        setShowCopyDialog(true);
                      } else {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = videos[currentVideoIndex].title + '.mp4';
                        a.target = '_blank';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }
                    }}
                    sx={{ 
                      color: 'white',
                      padding: '8px',
                    }}
                  >
                    <Download />
                  </IconButton>
                  <IconButton
                    color="primary"
                    onClick={() => toggleLike(videos[currentVideoIndex].id)}
                    sx={{ 
                      padding: '8px',
                    }}
                  >
                    {isLiked(videos[currentVideoIndex].id) ? (
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
              )}
            </Box>

            {/* Floating side control panel */}
            <Box
              sx={{
                position: 'absolute',
                right: '10px',
                top: isDebugMode ? '72px' : '50%',
                transform: isDebugMode ? 'none' : 'translateY(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                zIndex: 20,
                opacity: showControls ? 1 : 0.3,
                transition: 'opacity 0.3s ease-in-out',
              }}
            >
              {/* 隐藏底部面板按钮（所有模式都显示） */}
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

              {/* 用户模式下显示：点赞、弹幕、评论 */}
              {!isDebugMode && (
                <>
                  <IconButton
                    color="primary"
                    onClick={() => toggleLike(videos[currentVideoIndex].id)}
                    sx={{
                      width: 48,
                      height: 48,
                      padding: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: isLiked(videos[currentVideoIndex].id) ? '#ff4081' : 'white',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title={isLiked(videos[currentVideoIndex].id) ? '取消点赞' : '点赞'}
                  >
                    {isLiked(videos[currentVideoIndex].id)
                      ? <Favorite sx={{ fontSize: 28 }} />
                      : <FavoriteBorder sx={{ fontSize: 28 }} />}
                  </IconButton>
                  <IconButton
                    onClick={() => setShowDanmakuInput(true)}
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      width: '48px',
                      height: '48px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title="发送弹幕"
                  >
                    <span style={{fontWeight:'bold',fontSize:15,fontFamily:'Impact, Arial Black, sans-serif',letterSpacing:1}}>弹</span>
                  </IconButton>
                  <IconButton
                    onClick={() => setShowCommentInput(true)}
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      width: '48px',
                      height: '48px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title="评论视频"
                  >
                    <ChatBubbleIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </>
              )}

              {/* 调试模式下显示全部按钮 */}
              {isDebugMode && (
                <>
                  <IconButton
                    onClick={() => {
                      const url = `${API_BASE_URL}${videos[currentVideoIndex].url}`;
                      if (isWeChatBrowser) {
                        setCopyUrl(url);
                        setShowCopyDialog(true);
                      } else {
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = videos[currentVideoIndex].file_name || videos[currentVideoIndex].title + '.mp4';
                        a.target = '_blank';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }
                    }}
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      width: '48px',
                      height: '48px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title={'下载当前视频'}
                  >
                    <Download />
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
                    color="primary"
                    onClick={() => toggleLike(videos[currentVideoIndex].id)}
                    sx={{
                      width: 48,
                      height: 48,
                      padding: 0,
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: isLiked(videos[currentVideoIndex].id) ? '#ff4081' : 'white',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title={isLiked(videos[currentVideoIndex].id) ? '取消点赞' : '点赞'}
                  >
                    {isLiked(videos[currentVideoIndex].id)
                      ? <Favorite sx={{ fontSize: 28 }} />
                      : <FavoriteBorder sx={{ fontSize: 28 }} />}
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
                    onClick={() => setShowDanmakuInput(true)}
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      width: '48px',
                      height: '48px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title="发送弹幕"
                  >
                    <span style={{fontWeight:'bold',fontSize:15,fontFamily:'Impact, Arial Black, sans-serif',letterSpacing:1}}>弹</span>
                  </IconButton>
                  <IconButton
                    onClick={() => setShowCommentInput(true)}
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      width: '48px',
                      height: '48px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title="评论视频"
                  >
                    <ChatBubbleIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                  <IconButton
                    onClick={() => {
                      console.log('编辑标签输入框内容1:', videos[currentVideoIndex]?.title);
                      setEditTitleInput(videos[currentVideoIndex].title);
                      console.log('编辑标签输入框内容2:', editTitleInput);
                      setShowEditTitle(true);
                    }}
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      width: '48px',
                      height: '48px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title="编辑标签"
                  >
                    <LabelOutlinedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                  <IconButton
                    onClick={() => {
                      saveCurrentVideoState(); // 保存当前视频状态
                      setEditFileNameInput((videos[currentVideoIndex]?.file_name || '').replace(/\.mp4$/i, ''));
                      setShowEditFileName(true);
                    }}
                    sx={{
                      backgroundColor: 'rgba(0, 0, 0, 0.6)',
                      color: 'white',
                      width: '48px',
                      height: '48px',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      },
                    }}
                    title="编辑文件名"
                  >
                    <EditNoteIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </>
              )}
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
                <div style={{ marginBottom: '4px', wordBreak: 'break-all', fontSize: '11px', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '4px' }}>
                  📝 <strong>当前视频对象:</strong>
                  <button
                    style={{
                      fontSize: '11px',
                      margin: '4px 0',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid #ffb300',
                      background: showVideoObjDetail ? '#ffb300' : 'transparent',
                      color: showVideoObjDetail ? '#222' : '#ffb300',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowVideoObjDetail(v => !v)}
                  >
                    {showVideoObjDetail ? '收起' : '展开'}
                  </button>
                  {showVideoObjDetail && videos[currentVideoIndex] && Object.entries(videos[currentVideoIndex])
                    .filter(([key]) => !['url', 'likes', 'category'].includes(key))
                    .map(([key, value]) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 2 }}>
                        <span style={{ fontWeight: 'bold', minWidth: 60, color: '#ffb300', flexShrink: 0 }}>{key}:</span>
                        <span style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap', marginLeft: 4 }}>{String(value)}</span>
                      </div>
                    ))}
                </div>
              </Box>
            )}

            {/* 微信浏览器下复制链接弹窗 */}
            {showCopyDialog && (
              <Box
                sx={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  bgcolor: 'rgba(0,0,0,0.5)',
                  zIndex: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onClick={closeCopyDialog}
              >
                <Box
                  sx={{
                    background: 'white',
                    borderRadius: 2,
                    p: 3,
                    minWidth: 280,
                    boxShadow: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <Typography variant="h6" sx={{ color: '#ff4081', mb: 1, fontWeight: 700 }}>
                    复制下载链接
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#333', mb: 1 }}>
                    长按下方链接进行复制，然后用浏览器打开并粘贴下载：
                  </Typography>
                  <input
                    type="text"
                    value={copyUrl}
                    readOnly
                    style={{
                      width: '100%',
                      fontSize: 16,
                      padding: 8,
                      border: '1px solid #ccc',
                      borderRadius: 4,
                      background: '#f7f7f7',
                      color: '#222',
                      textAlign: 'center',
                    }}
                    onFocus={e => (e.target as HTMLInputElement).select()}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <Button variant="contained" color="primary" onClick={closeCopyDialog} sx={{ mt: 1 }}>
                    关闭
                  </Button>
                </Box>
              </Box>
            )}

            {/* 弹幕输入弹窗 */}
            {showDanmakuInput && (
              <Box
                sx={{
                  position: 'fixed',
                  bottom: '20%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.85)',
                  p: 2,
                  borderRadius: 2,
                  zIndex: 2000,
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  minWidth: 260,
                }}
              >
                <input
                  value={danmakuInput}
                  onChange={e => setDanmakuInput(e.target.value)}
                  placeholder="输入弹幕内容"
                  maxLength={50}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    outline: 'none',
                  }}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      sendDanmaku();
                    }
                  }}
                />
                <Button
                  variant="contained"
                  color="primary"
                  size="small"
                  sx={{ minWidth: 60, fontWeight: 700 }}
                  onClick={sendDanmaku}
                  disabled={!danmakuInput.trim()}
                >发送</Button>
                <Button
                  variant="text"
                  color="inherit"
                  size="small"
                  sx={{ minWidth: 40 }}
                  onClick={() => setShowDanmakuInput(false)}
                >取消</Button>
              </Box>
            )}

            {/* 评论输入弹窗 */}
            {showCommentInput && (
              <Box
                sx={{
                  position: 'fixed',
                  bottom: '24%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.92)',
                  p: 2,
                  borderRadius: 2,
                  zIndex: 2100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                  minWidth: 320,
                  maxWidth: 520,
                  width: '96vw',
                  color: 'white',
                }}
              >
                <Box sx={{ mb: 1, fontWeight: 700, fontSize: 16 }}>视频评论</Box>
                <Box sx={{ maxHeight: 120, overflowY: 'auto', mb: 1, bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 1, p: 1 }}>
                  {loadingComments ? '加载中...' : (
                    comments.length === 0 ? <span style={{ color: '#aaa' }}>暂无评论</span> :
                    // 用textarea只读展示，便于长按/右键复制
                    <textarea
                      value={comments[0]}
                      readOnly
                      style={{
                        width: '100%',
                        minHeight: 50,
                        fontSize: 14,
                        background: 'transparent',
                        color: 'white',
                        border: 'none',
                        resize: 'none',
                        outline: 'none',
                        padding: 0,
                        margin: 0,
                        cursor: 'copy',
                        userSelect: 'text',
                      }}
                    />
                  )}
                </Box>
                <textarea
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  placeholder="输入评论内容"
                  maxLength={300}
                  rows={3}
                  style={{
                    fontSize: 15,
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    outline: 'none',
                    marginBottom: 8,
                    width: '100%',
                    minWidth: 220,
                    maxWidth: 500,
                    minHeight: 60,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    background: '#181818',
                    color: 'white',
                  }}
                  autoFocus
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    sx={{ minWidth: 60, fontWeight: 700 }}
                    onClick={sendComment}
                    disabled={!commentInput.trim()}
                  >发送</Button>
                  <Button
                    variant="text"
                    color="inherit"
                    size="small"
                    sx={{ minWidth: 40 }}
                    onClick={() => setShowCommentInput(false)}
                  >取消</Button>
                </Box>
              </Box>
            )}

            {/* 编辑标题弹窗 */}
            {showEditTitle && (
              <Box
                sx={{
                  position: 'fixed',
                  bottom: '32%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.92)',
                  p: 2,
                  borderRadius: 2,
                  zIndex: 2200,
                  minWidth: 320,
                  maxWidth: 520,
                  width: '96vw',
                  color: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Box sx={{ mb: 1, fontWeight: 700, fontSize: 16 }}>编辑视频标签</Box>
                <input
                  value={editTitleInput}
                  onChange={e => setEditTitleInput(e.target.value)}
                  placeholder="输入新标签"
                  maxLength={100}
                  style={{
                    fontSize: 15,
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    outline: 'none',
                    marginBottom: 8,
                    width: '100%',
                    background: '#181818',
                    color: 'white',
                  }}
                  autoFocus
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    sx={{ minWidth: 60, fontWeight: 700 }}
                    onClick={async () => {
                      const video = videos[currentVideoIndex];
                      try {
                        await axios.post(`${API_BASE_URL}/api/videos/${video.id}/title`, { title: editTitleInput });
                        setVideos(prev =>
                          prev.map(v => v.id === video.id ? { ...v, title: editTitleInput } : v)
                        );
                        console.log('编辑标签输入框内容3:', videos[currentVideoIndex]?.title);
                        alert('标题修改成功');
                        setShowEditTitle(false);
                      } catch (err: any) {
                        alert('标题修改失败: ' + (err?.response?.data?.error || '网络错误'));
                      }
                    }}
                    disabled={!editTitleInput.trim()}
                  >保存</Button>
                  <Button
                    variant="text"
                    color="inherit"
                    size="small"
                    sx={{ minWidth: 40 }}
                    onClick={() => setShowEditTitle(false)}
                  >取消</Button>
                </Box>
              </Box>
            )}

            {/* 编辑文件名弹窗 */}
            {showEditFileName && (
              <Box
                sx={{
                  position: 'fixed',
                  bottom: '32%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0,0,0,0.92)',
                  p: 2,
                  borderRadius: 2,
                  zIndex: 2300,
                  minWidth: 320,
                  maxWidth: 520,
                  width: '96vw',
                  color: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                <Box sx={{ mb: 1, fontWeight: 700, fontSize: 16 }}>编辑文件名</Box>
                <textarea
                  value={editFileNameInput}
                  onChange={e => setEditFileNameInput(e.target.value)}
                  placeholder="输入新文件名"
                  maxLength={100}
                  rows={3}
                  style={{
                    fontSize: 15,
                    padding: '10px 14px',
                    borderRadius: 6,
                    border: '1px solid #ccc',
                    outline: 'none',
                    marginBottom: 8,
                    width: '100%',
                    background: '#181818',
                    color: 'white',
                    resize: 'vertical',
                    minHeight: 60,
                    maxHeight: 140,
                    boxSizing: 'border-box',
                  }}
                  autoFocus
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    sx={{ minWidth: 60, fontWeight: 700 }}
                    onClick={async () => {
                      const video = videos[currentVideoIndex];
                      try {
                        const newFileName = editFileNameInput.trim() + '.mp4';
                        await axios.post(`${API_BASE_URL}/api/videos/${video.id}/file_name`, { file_name: newFileName });
                        setVideos(prev =>
                          prev.map(v => v.id === video.id ? { ...v, file_name: newFileName } : v)
                        );
                        alert('文件名修改成功');
                        setShowEditFileName(false);
                      } catch (err: any) {
                        alert('文件名修改失败: ' + (err?.response?.data?.error || '网络错误'));
                      }
                    }}
                    disabled={!editFileNameInput.trim()}
                  >保存</Button>
                  <Button
                    variant="text"
                    color="inherit"
                    size="small"
                    sx={{ minWidth: 40 }}
                    onClick={() => setShowEditFileName(false)}
                  >取消</Button>
                </Box>
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