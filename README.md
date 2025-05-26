# Local Video Feed App

A TikTok-like video feed application that runs on your local network. This application allows you to browse and watch videos stored locally on your computer, with a similar interface to TikTok.

这是一个类似于tiktok的短视频项目，但是只支持本地部署，有点像一个私人定制的短视频网站

## Features

- Vertical scrolling video feed
- Video controls
- Like/unlike videos
- Responsive design
- Works on local network

## Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

## Project Structure

```
.
├── src/               # Frontend React application
├── server/            # Backend Express server
│   ├── videos/        # Directory for your video files
│   └── index.js      # Server entry point
└── README.md
```

## Setup Instructions

1. Clone the repository
2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Install backend dependencies:
   ```bash
   cd server
   npm install
   ```

4. Add your video files:
   - Create a `videos` directory inside the `server` folder
   - Copy your .mp4 video files into the `server/videos` directory

## Running the Application

1. Start the backend server:
   ```bash
   cd server
   npm start
   ```
   The server will run on port 3001

2. Start the frontend development server:
   ```bash
   # In the project root directory
   npm run dev
   ```
   The frontend will run on port 5173

3. Access the application:
   - Local access: http://localhost:5173
   - Network access: http://[your-ip-address]:5173
     (Find your IP address using `ipconfig` on Windows or `ifconfig` on Linux/Mac)

## Notes

- The application only works with MP4 video files
- Videos must be placed in the `server/videos` directory
- The application is accessible from any device on your local network using your computer's IP address
