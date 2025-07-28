import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useState, useRef } from 'react';
import VideoFeed from './components/VideoFeed';
import Navbar from './components/Navbar';

interface Video {
  id: number;
  url: string;
  title: string;
  likes: number;
  category: string;
  file_name: string;
}

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ff4081',
    },
    secondary: {
      main: '#03dac6',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

function App() {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isDebugMode, setIsDebugMode] = useState(() => {
    // 从localStorage读取用户之前的模式选择
    const savedMode = localStorage.getItem('videoPlayerMode');
    return savedMode === 'debug';
  });
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const videoAreaRef = useRef<HTMLDivElement>(null);

  const toggleDebugMode = () => {
    const newMode = !isDebugMode;
    setIsDebugMode(newMode);
    localStorage.setItem('videoPlayerMode', newMode ? 'debug' : 'user');
  };

  const handleVideoSelect = (video: Video) => {
    setSelectedVideo(video);
  };

  const handleSearchResults = (results: Video[]) => {
    setSearchResults(results);
    setIsSearchMode(true);
  };

  const handleExitSearchMode = () => {
    setIsSearchMode(false);
    setSearchResults([]);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Navbar 
          selectedCategory={selectedCategory} 
          onCategoryChange={(category) => {
            setSelectedCategory(category);
            handleExitSearchMode(); // 切换分类时退出搜索模式
          }}
          isDebugMode={isDebugMode}
          onToggleDebugMode={toggleDebugMode}
          onVideoSelect={handleVideoSelect}
          onSearchResults={handleSearchResults}
          onExitSearchMode={handleExitSearchMode}
          videoAreaRef={videoAreaRef}
          isSearchMode={isSearchMode}
        />
        <div ref={videoAreaRef} style={{ position: 'relative' }}>
          <Routes>
            <Route path="/" element={
              <VideoFeed 
                selectedCategory={selectedCategory} 
                isDebugMode={isDebugMode}
                selectedVideo={selectedVideo}
                onVideoSelect={handleVideoSelect}
                searchResults={searchResults}
                isSearchMode={isSearchMode}
              />
            } />
          </Routes>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
