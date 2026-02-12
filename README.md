# AI Resume Builder (Full Stack MERN + Gemini + PDF Export)

A full-stack AI-powered Resume Builder application that allows users to create, preview, save, manage, and export ATS-friendly resumes as PDFs.

Built using React, Node.js, Express, MongoDB, JWT Authentication, Google Gemini AI, and Puppeteer PDF generation.

---

## Features

### Authentication
- User Registration and Login
- JWT-based authentication
- Protected routes
- Secure password hashing using bcrypt

### AI Resume Summary
- AI-generated professional summary
- Powered by Google Gemini API
- ATS-friendly and recruiter-focused formatting
- Retry handling for API overload cases

### Resume Builder
- Personal Details
- Education
- Skills
- Experience (conditional section)
- Projects (conditional section)
- Certificates (conditional section)
- Languages (Read, Write, Speak)
- Nationality and Availability

### PDF Export
- Generates dynamic HTML
- Converts to PDF using Puppeteer
- Works locally and in production (Render)
- ATS-friendly formatting

### Dashboard (In Progress)
- List user-created resumes
- Resume management
- Future edit and delete functionality

---

## Tech Stack

### Frontend
- React
- Tailwind CSS
- Axios
- React Router

### Backend
- Node.js
- Express
- MongoDB
- JWT
- bcrypt
- Google Gemini AI
- Puppeteer
- @sparticuz/chromium (production PDF support)

---

## Project Structure

```
backend/
│
├── src/
│   ├── config/
│   │   └── db.js
│   │
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── ai.controller.js
│   │   ├── portfolio.controller.js
│   │   └── pdf.controller.js
│   │
│   ├── middleware/
│   │   └── auth.middleware.js
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── ai.routes.js
│   │   ├── portfolio.routes.js
│   │   └── pdf.routes.js
│   │
│   ├── services/
│   │   └── gemini.service.js
│   │
│   ├── utils/
│   │   ├── browser.js
│   │   └── normalizeEducation.js
│   │
│   └── server.js
│
└── package.json
```

---

## Environment Variables

Create a `.env` file inside the backend folder:

```
PORT=4000
NODE_ENV=development

MONGODB_URI=mongodb+srv://your-connection-string
JWT_SECRET=your_jwt_secret

GOOGLE_API_KEY=your_google_gemini_api_key

FRONTEND_ORIGIN=http://localhost:3000
```

For production (Render):

```
NODE_ENV=production
```

---

## Installation and Setup

### Clone Repository

```
git clone https://github.com/your-username/ai-resume-builder.git
cd ai-resume-builder
```

### Backend Setup

```
cd backend
npm install
node src/server.js
```

Server runs on:

```
http://localhost:4000
```

### Frontend Setup

```
cd frontend
npm install
npm start
```

Frontend runs on:

```
http://localhost:3000
```

---

## API Endpoints

### Authentication
```
POST /auth/register
POST /auth/login
```

### AI
```
POST /ai/generate
```

### Portfolio
```
POST /portfolio        (Protected)
GET  /portfolio        (Protected)
```

### PDF Export
```
POST /pdf/export
```

---

## PDF Generation Logic

- HTML dynamically generated from resume data
- Puppeteer converts HTML to PDF
- Automatically downloads with user name
- Supports local and production environments

---

## Key Technical Highlights

- Modular backend architecture following MVC pattern
- Environment-based browser handling for PDF generation
- Clean ATS-friendly HTML structure
- Conditional section rendering for better user experience
- Proper validation before saving resume
- Structured error handling
- Retry mechanism for AI API overload

---

## Current Status

- Resume Builder Complete  
- AI Summary Generation Implemented  
- PDF Export Implemented  
- Authentication Implemented  
- Dashboard in progress  
- Minor styling refinements remaining  

---

## Future Improvements

- Resume editing from dashboard
- Resume template selection
- Cloud PDF storage
- Public resume share link
- Payment integration
- Dark mode support

---

## Author

Mohammed Shibili  
Full Stack Developer
