import { useState, useEffect, useRef } from 'react';
import { Box, IconButton, Typography, CircularProgress, Switch, FormControlLabel, Slider } from '@mui/material';
import { Favorite, FavoriteBorder, PlayArrow, Pause, Shuffle } from '@mui/icons-material';
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

const API_BASE_URL = 'http://172.20.10.4:3001';

// Number of videos to preload
const PRELOAD_COUNT = 3;

const VideoFeed = ({ selectedCategory }: VideoFeedProps) => {
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [likedVideos, setLikedVideos] = useState<Set<number>>(new Set());
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [isRandomPlay, setIsRandomPlay] = useState(false);
  const [showControls, setShowControls] = useState(true);
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

  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const response = await axios.get(
          selectedCategory === 'all' 
            ? `${API_BASE_URL}/api/videos`
            : `${API_BASE_URL}/api/videos/${selectedCategory}`
        );
        setVideos(response.data);
        setCurrentVideoIndex(Math.floor(Math.random() * response.data.length));
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

    // Set new timeout to hide controls
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
      const nextIndex = getNextVideoIndex();
      setCurrentVideoIndex(nextIndex);
      // Reset video ready state for next video
      setIsVideoReady(false);
      autoPlayAttemptRef.current = 0;
    }
  };

  // Handle play state changes
  useEffect(() => {
    if (isPlaying) {
      showControlsTemporarily();
    } else {
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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartY.current;

    if (Math.abs(deltaY) > 50) {
      if (deltaY < 0) {
        // Swipe up - next video
        setCurrentVideoIndex(getNextVideoIndex());
      } else if (deltaY > 0 && currentVideoIndex > 0) {
        // Swipe down - previous video
        setCurrentVideoIndex(prev => prev - 1);
      }
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
          touchAction: 'pan-y',
          cursor: showControls ? 'auto' : 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
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
              controls={showControls}
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

            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                p: 2,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8) 40%)',
                color: 'white',
                opacity: showControls ? 1 : 0,
                transition: 'opacity 0.3s ease-in-out',
                pointerEvents: showControls ? 'auto' : 'none',
              }}
            >
              <Box sx={{ width: '100%', mb: 1 }}>
                <Slider
                  value={progress}
                  onChange={handleProgressChange}
                  sx={{
                    color: '#ff4081',
                    height: 4,
                    '& .MuiSlider-thumb': {
                      width: 8,
                      height: 8,
                      transition: '0.3s cubic-bezier(.47,1.64,.41,.8)',
                      '&:hover, &.Mui-focusVisible': {
                        boxShadow: '0px 0px 0px 8px rgba(255, 64, 129, 0.16)',
                      },
                      '&.Mui-active': {
                        width: 12,
                        height: 12,
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
                  mt: -1,
                  fontSize: '0.75rem',
                  opacity: 0.7
                }}>
                  <span>{formatTime(videoRef.current?.currentTime || 0)}</span>
                  <span>{formatTime(duration)}</span>
                </Box>
              </Box>
              
              <Typography 
                variant="h6" 
                sx={{ 
                  textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                  pointerEvents: 'auto'
                }}
              >
                {videos[currentVideoIndex].title}
              </Typography>
              
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
                    },
                  }}
                />
                <IconButton
                  onClick={() => setIsRandomPlay(!isRandomPlay)}
                  sx={{ 
                    color: isRandomPlay ? '#ff4081' : 'white',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    },
                  }}
                >
                  <Shuffle />
                </IconButton>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
                  <IconButton
                    color="primary"
                    onClick={togglePlayPause}
                    sx={{ color: 'white' }}
                  >
                    {isPlaying ? <Pause /> : <PlayArrow />}
                  </IconButton>
                  <IconButton
                    color="primary"
                    onClick={() => toggleLike(videos[currentVideoIndex].id)}
                  >
                    {likedVideos.has(videos[currentVideoIndex].id) ? (
                      <Favorite sx={{ color: '#ff4081' }} />
                    ) : (
                      <FavoriteBorder sx={{ color: 'white' }} />
                    )}
                  </IconButton>
                  <Typography variant="body2" sx={{ color: 'white' }}>
                    {videos[currentVideoIndex].likes}
                  </Typography>
                </Box>
              </Box>
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