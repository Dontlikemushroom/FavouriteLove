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
}

const API_BASE_URL = 'http://192.168.104.88:3001';

// Number of videos to preload
const PRELOAD_COUNT = 3;

const VideoFeed = ({ selectedCategory }: VideoFeedProps) => {
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
  const [isVerticalVideo, setIsVerticalVideo] = useState(true);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const autoPlayAttemptRef = useRef<number>(0);
  const maxAutoPlayAttempts = 3;
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);
  const preloadRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [touchFeedback, setTouchFeedback] = useState<string>('');
  const [touchDirection, setTouchDirection] = useState<'up' | 'down' | ''>('');

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const response = await axios.get(
          selectedCategory === 'all' 
            ? `${API_BASE_URL}/api/videos`
            : `${API_BASE_URL}/api/videos/${selectedCategory}`
        );
        setVideos(response.data);
        
        // 从localStorage恢复观看历史
        const savedHistory = localStorage.getItem(`watchHistory_${selectedCategory}`);
        const savedCurrentIndex = localStorage.getItem(`currentIndex_${selectedCategory}`);
        
        if (savedHistory && savedCurrentIndex) {
          const history = JSON.parse(savedHistory);
          const currentIndex = parseInt(savedCurrentIndex);
          
          if (currentIndex < response.data.length) {
            setWatchHistory(history);
            setCurrentVideoIndex(currentIndex);
            setHistoryIndex(history.length - 1);
          } else {
            setCurrentVideoIndex(Math.floor(Math.random() * response.data.length));
          }
        } else {
          setCurrentVideoIndex(Math.floor(Math.random() * response.data.length));
        }
        setError(null);
      } catch (error) {
        console.error('Error fetching videos:', error);
        setError('Failed to load videos');
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
    // 避免重复添加相同的视频
    if (watchHistory.length === 0 || watchHistory[watchHistory.length - 1] !== videoIndex) {
      // 如果当前在历史记录中浏览，清除当前位置之后的历史记录
      let newHistory;
      if (historyIndex >= 0 && historyIndex < watchHistory.length - 1) {
        // 用户从历史记录中继续观看新视频，清除当前位置之后的历史
        newHistory = watchHistory.slice(0, historyIndex + 1);
      } else {
        newHistory = [...watchHistory];
      }
      
      newHistory.push(videoIndex);
      setWatchHistory(newHistory);
      // 当添加新视频到历史时，重置historyIndex为-1（表示当前不在历史记录中）
      setHistoryIndex(-1);
      
      // 调试信息：在控制台显示历史记录状态
      console.log(`添加视频${videoIndex}到历史记录，当前历史:`, newHistory, '播放模式:', isRandomPlay ? '随机' : '顺序');
    }
  };

  // 从历史记录中获取上一个视频
  const getPreviousFromHistory = () => {
    // 如果当前在历史记录中，返回上一个视频
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      console.log(`从历史记录位置${historyIndex}回到位置${prevIndex}，视频:`, watchHistory[prevIndex]);
      return watchHistory[prevIndex];
    }
    // 如果当前不在历史记录中，但有历史记录，返回最后一个历史视频
    else if (watchHistory.length > 0) {
      const lastIndex = watchHistory.length - 1;
      setHistoryIndex(lastIndex);
      console.log(`从新视频回到历史记录最后位置${lastIndex}，视频:`, watchHistory[lastIndex]);
      return watchHistory[lastIndex];
    }
    console.log('没有历史记录可返回');
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
    const handleCanPlay = () => setIsBuffering(false);

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
      // Check if video is vertical or horizontal
      const aspectRatio = video.videoWidth / video.videoHeight;
      setIsVerticalVideo(aspectRatio <= 1);
      setIsVideoReady(true);
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
      // 记录当前视频作为历史，然后切换到下一个
      const nextIndex = getNextVideoIndex();
      addToHistory(currentVideoIndex); // 记录当前视频
      setCurrentVideoIndex(nextIndex);
      // Reset video ready state for next video
      setIsVideoReady(false);
      autoPlayAttemptRef.current = 0;
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
  useEffect(() => {
    const preloadNextVideo = () => {
      const video = preloadRefs.current[0];
      if (video) {
        video.preload = "metadata";
        video.addEventListener('loadedmetadata', () => {
          // 只加载前30秒
          if (video.duration > 30) {
            video.currentTime = 30;
          }
        });
      }
    };

    if (videos.length > 0) {
      preloadNextVideo();
    }
  }, [currentVideoIndex, videos]);

  // Add progress tracking
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setProgress((video.currentTime / video.duration) * 100);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [currentVideoIndex]);

  // Add progress bar change handler
  const handleProgressChange = (_event: Event, newValue: number | number[]) => {
    if (videoRef.current && typeof newValue === 'number') {
      const time = (newValue / 100) * duration;
      videoRef.current.currentTime = time;
      setProgress(newValue);
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

    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * videos.length);
    } while (nextIndex === currentVideoIndex);

    return nextIndex;
  };

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
    setTouchDirection('');
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;

    // 增加最小滑动距离，避免误触
    if (Math.abs(deltaY) > 80) {
      if (deltaY < 0) {
        // Swipe up - next video (记录上一个视频，然后切换到下一个)
        setTouchDirection('up');
        const nextIndex = getNextVideoIndex();
        const playMode = isRandomPlay ? '随机' : '顺序';
        setTouchFeedback(`${playMode}下一个视频`);
        // 记录当前视频作为历史（这样下滑时就能回到当前视频）
        console.log(`上滑：记录视频${currentVideoIndex}，切换到视频${nextIndex}，播放模式: ${playMode}`);
        addToHistory(currentVideoIndex);
        setCurrentVideoIndex(nextIndex);
      } else if (deltaY > 0) {
        // Swipe down - 依次显示历史视频
        setTouchDirection('down');
        const prevIndex = getPreviousFromHistory();
        if (prevIndex !== null) {
          const remainingHistory = historyIndex >= 0 ? historyIndex : watchHistory.length - 1;
          setTouchFeedback(`上一个视频 (还有${remainingHistory}个历史)`);
          console.log(`下滑：回到视频${prevIndex}，剩余历史: ${remainingHistory}个`);
          setCurrentVideoIndex(prevIndex);
        } else {
          setTouchFeedback('没有更多历史');
          console.log('下滑：没有更多历史记录');
        }
      }
      
      // 清除反馈信息
      setTimeout(() => {
        setTouchFeedback('');
        setTouchDirection('');
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

  const resetLastWatched = () => {
    setWatchHistory([]);
    setHistoryIndex(-1);
    localStorage.removeItem(`watchHistory_${selectedCategory}`);
    localStorage.removeItem(`currentIndex_${selectedCategory}`);
    setCurrentVideoIndex(Math.floor(Math.random() * videos.length));
  };

  // 切换底部面板显示
  const toggleBottomPanel = () => {
    setShowBottomPanel(!showBottomPanel);
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
        bgcolor: 'background.default',
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
          bgcolor: 'background.paper',
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
              key={videos[currentVideoIndex].url}
              src={`${API_BASE_URL}${videos[currentVideoIndex].url}`}
              style={{
                width: isVerticalVideo ? '100%' : 'auto',
                height: isVerticalVideo ? '100%' : '100%',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: isVerticalVideo ? 'cover' : 'contain',
              }}
              controls={false}
              playsInline
              preload="auto"
              onLoadedMetadata={handleVideoMetadata}
              onCanPlay={() => setIsVideoReady(true)}
              onWaiting={() => setIsVideoReady(false)}
              onError={handleVideoError}
              onEnded={handleVideoEnd}
              onPlay={() => {
                setIsPlaying(true);
                if (videoRef.current) {
                  videoRef.current.muted = false;
                }
              }}
              onPause={() => setIsPlaying(false)}
            />

            {!isVerticalVideo && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  bgcolor: 'black',
                  zIndex: -1,
                }}
              />
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

            {/* Touch feedback indicator */}
            {touchFeedback && (
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'rgba(0, 0, 0, 0.8)',
                  color: 'white',
                  padding: '12px 20px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  zIndex: 15,
                  animation: 'fadeInOut 1s ease-in-out',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  '@keyframes fadeInOut': {
                    '0%': { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' },
                    '20%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
                    '80%': { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
                    '100%': { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' },
                  },
                }}
              >
                <span style={{ 
                  fontSize: '18px',
                  color: touchDirection === 'up' ? '#4CAF50' : touchDirection === 'down' ? '#FF9800' : 'white'
                }}>
                  {touchDirection === 'up' ? '↑' : touchDirection === 'down' ? '↓' : ''}
                </span>
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
                {watchHistory.length > 0 && (
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: historyIndex >= 0 ? '#ff4081' : '#4CAF50',
                      backgroundColor: historyIndex >= 0 ? 'rgba(255, 64, 129, 0.2)' : 'rgba(76, 175, 80, 0.2)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.7rem'
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
                  onClick={resetLastWatched}
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
                onClick={resetLastWatched}
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