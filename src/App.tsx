import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { useState } from 'react';
import VideoFeed from './components/VideoFeed';
import Navbar from './components/Navbar';

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

  const toggleDebugMode = () => {
    const newMode = !isDebugMode;
    setIsDebugMode(newMode);
    localStorage.setItem('videoPlayerMode', newMode ? 'debug' : 'user');
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Navbar 
          selectedCategory={selectedCategory} 
          onCategoryChange={(category) => setSelectedCategory(category)}
          isDebugMode={isDebugMode}
          onToggleDebugMode={toggleDebugMode}
        />
        <Routes>
          <Route path="/" element={<VideoFeed selectedCategory={selectedCategory} isDebugMode={isDebugMode} />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
