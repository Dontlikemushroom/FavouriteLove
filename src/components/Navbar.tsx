import { AppBar, Toolbar, IconButton, FormControl, Select, MenuItem, InputLabel, Box, Drawer, List, ListItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import { Menu as MenuIcon, Settings, Info, HelpOutline } from '@mui/icons-material';
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

  // Drawer 抽屉菜单状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const handleDrawerOpen = () => setDrawerOpen(true);
  const handleDrawerClose = () => setDrawerOpen(false);

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
          {/* 列表按钮和抽屉菜单 */}
          <IconButton
            edge="start"
            color="inherit"
            onClick={handleDrawerOpen}
            sx={{
              color: 'white',
              background: 'none',
              boxShadow: 'none',
              outline: 'none',
              '&:hover': {
                backgroundColor: 'transparent',
                boxShadow: 'none',
              },
              '&:focus': {
                outline: 'none',
                boxShadow: 'none',
              },
              '&:active': {
                backgroundColor: 'transparent',
                boxShadow: 'none',
              },
            }}
          >
            <MenuIcon />
          </IconButton>
          <Drawer
            anchor="left"
            open={drawerOpen}
            onClose={handleDrawerClose}
            PaperProps={{
              sx: {
                width: 240,
                bgcolor: 'rgba(30,30,40,0.98)',
                color: '#fff',
                borderTopRightRadius: 16,
                borderBottomRightRadius: 16,
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                p: 0,
              }
            }}
          >
            <Box sx={{ height: 56 }} /> {/* 顶部留白对齐AppBar */}
            <List>
              <ListItem button onClick={() => { /* 设置功能 */ handleDrawerClose(); }}>
                <ListItemIcon><Settings sx={{ color: '#ff4081' }} /></ListItemIcon>
                <ListItemText primary="设置" />
              </ListItem>
              <Divider sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
              <ListItem button onClick={() => { /* 关于功能 */ handleDrawerClose(); }}>
                <ListItemIcon><Info sx={{ color: '#7c3aed' }} /></ListItemIcon>
                <ListItemText primary="关于" />
              </ListItem>
              <Divider sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
              <ListItem button onClick={() => { /* 帮助功能 */ handleDrawerClose(); }}>
                <ListItemIcon><HelpOutline sx={{ color: '#4caf50' }} /></ListItemIcon>
                <ListItemText primary="帮助" />
              </ListItem>
            </List>
          </Drawer>

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
              <MenuItem value="videos">原汁原味💦</MenuItem>
              <MenuItem value="videos1">成人色情🔞</MenuItem>
              <MenuItem value="videos2">擦边博主🥵</MenuItem>
              <MenuItem value="top20">最热点赞😍</MenuItem>
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