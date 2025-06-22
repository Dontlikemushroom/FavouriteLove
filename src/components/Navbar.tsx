import { AppBar, Toolbar, IconButton, FormControl, Select, MenuItem, InputLabel, Box } from '@mui/material';
import { Home } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

interface NavbarProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  isDebugMode: boolean;
  onToggleDebugMode: () => void;
}

const Navbar = ({ selectedCategory, onCategoryChange, isDebugMode, onToggleDebugMode }: NavbarProps) => {
  const navigate = useNavigate();
  const [isSpinning, setIsSpinning] = useState(false);

  const handleToggleDebugMode = () => {
    setIsSpinning(true);
    onToggleDebugMode();
  };

  useEffect(() => {
    if (isSpinning) {
      const timer = setTimeout(() => {
        setIsSpinning(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isSpinning]);

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        boxShadow: 'none',
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: '56px !important', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => navigate('/')}
            sx={{
              color: 'white',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
              },
            }}
          >
            <Home />
          </IconButton>

          <FormControl 
            size="small"
            sx={{ 
              minWidth: 120,
              '& .MuiInputLabel-root': {
                color: 'rgba(255, 255, 255, 0.7)',
                '&.Mui-focused': {
                  color: '#ff4081',
                },
              },
              '& .MuiOutlinedInput-root': {
                color: 'white',
                '& fieldset': {
                  borderColor: 'rgba(255, 255, 255, 0.23)',
                },
                '&:hover fieldset': {
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#ff4081',
                },
              },
              '& .MuiSelect-icon': {
                color: 'white',
              },
            }}
          >
            <InputLabel id="category-label">视频分类</InputLabel>
            <Select
              labelId="category-label"
              value={selectedCategory}
              label="视频分类"
              onChange={(e) => onCategoryChange(e.target.value)}
            >
              <MenuItem value="all">全部视频</MenuItem>
              <MenuItem value="videos">默认分类</MenuItem>
              <MenuItem value="videos1">分类一</MenuItem>
              <MenuItem value="videos2">分类二</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* 模式切换按钮 - 右侧 */}
        <IconButton
          onClick={handleToggleDebugMode}
          sx={{
            backgroundColor: isDebugMode ? 'rgba(255, 64, 129, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            color: isDebugMode ? '#ff4081' : 'white',
            width: '40px',
            height: '40px',
            border: isDebugMode ? '2px solid #ff4081' : '2px solid transparent',
            transition: 'all 0.3s ease-in-out',
            '&:hover': {
              backgroundColor: isDebugMode ? 'rgba(255, 64, 129, 0.3)' : 'rgba(255, 255, 255, 0.2)',
              transform: 'scale(1.1)',
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
          }}
          title={isDebugMode ? '切换到用户模式' : '切换到调试模式'}
        >
          <Box
            sx={{
              fontSize: '18px',
              transition: 'transform 0.6s ease-in-out',
              transform: 'rotate(0deg)',
              '&.spinning': {
                animation: 'spin 0.6s ease-in-out',
              },
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
            className={isSpinning ? 'spinning' : ''}
          >
            {isDebugMode ? '🐞' : '👤'}
          </Box>
        </IconButton>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar; 