import { AppBar, Toolbar, IconButton, FormControl, Select, MenuItem, InputLabel } from '@mui/material';
import { Home } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const Navbar = ({ selectedCategory, onCategoryChange }: NavbarProps) => {
  const navigate = useNavigate();

  return (
    <AppBar 
      position="fixed" 
      sx={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(10px)',
        boxShadow: 'none',
      }}
    >
      <Toolbar sx={{ gap: 2, minHeight: '56px !important' }}>
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
      </Toolbar>
    </AppBar>
  );
};

export default Navbar; 