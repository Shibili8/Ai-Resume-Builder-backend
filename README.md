# Backend (Express) - AI Resume & Portfolio Builder

## Features added
- User authentication (register + login) using bcrypt + JWT, storing users in MongoDB.
- Resume generation endpoint that proxies to OpenAI.
- Resume-to-PDF export endpoint using Puppeteer (`POST /pdf/generate` accepts HTML and returns path to generated PDF stored on server).

## Run locally
1. copy .env.example to .env and fill values.
2. npm install
3. npm run dev

Note: Puppeteer may download a Chromium binary. In containerized or Render environments, ensure required dependencies are available or use a custom Chromium build.
