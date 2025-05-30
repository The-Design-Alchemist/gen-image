// server.js - Express.js backend with DALL-E integration
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Set this in your .env file
});

// Middleware
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Check file extension if MIME type is not reliable
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    // Accept if MIME type is correct OR if extension is valid
    if (file.mimetype.startsWith('image/') || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed! (JPG, PNG, WebP)'), false);
    }
  }
});

// Profession prompts for better AI generation
const professionPrompts = {
  pilot: "professional airline pilot wearing crisp pilot uniform with captain's hat and wings badge, confident pose in airplane cockpit, realistic photo style",
  astronaut: "astronaut in detailed NASA spacesuit with helmet, floating in space station or spacewalk, Earth visible in background, photorealistic",
  doctor: "medical doctor wearing white lab coat with stethoscope around neck, standing in modern hospital room, professional and caring expression",
  chef: "master chef in pristine white chef's hat and apron, holding cooking utensils in professional kitchen, confident culinary expert pose",
  artist: "creative artist wearing paint-splattered apron, holding paintbrush and palette, surrounded by colorful artwork in bright studio",
  musician: "talented musician performing on stage with instrument, dramatic stage lighting, concert atmosphere, passionate performance",
  firefighter: "heroic firefighter in full protective gear with helmet and oxygen tank, fire truck in background, brave and determined expression",
  teacher: "friendly teacher in classroom setting, pointing at whiteboard with educational content, warm and engaging expression"
};

// API Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Career Transformer API is running!' });
});

// Upload and transform image
app.post('/api/transform', upload.single('image'), async (req, res) => {
  try {
    const { profession } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    if (!profession || !professionPrompts[profession]) {
      return res.status(400).json({ error: 'Invalid profession selected' });
    }

    console.log(`Processing transformation: ${profession} for file: ${req.file.filename}`);

    // Create prompt for DALL-E 3 (using generation instead of editing for better results)
    const prompt = `A professional portrait photo of a person working as a ${professionPrompts[profession]}. High quality, realistic, professional photography style, good lighting, clear details.`;

    console.log('Calling OpenAI with prompt:', prompt);

    // Use DALL-E 3 generation (more reliable than editing)
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard", // Use "standard" instead of "hd" to reduce cost and improve speed
      response_format: "url"
    });

    console.log('OpenAI response received successfully');

    // Clean up uploaded file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const generatedImageUrl = response.data[0].url;
    const revisedPrompt = response.data[0].revised_prompt || prompt;

    res.json({
      success: true,
      imageUrl: generatedImageUrl,
      profession: profession,
      prompt: prompt,
      revisedPrompt: revisedPrompt
    });

  } catch (error) {
    console.error('Transformation error:', error);
    
    // Clean up uploaded file in case of error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({ 
        error: 'API quota exceeded. Please add more credits to your OpenAI account.' 
      });
    }
    
    if (error.status === 400) {
      return res.status(400).json({ 
        error: 'Invalid request. Please try a different image or profession.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to generate transformation. Please try again.' 
    });
  }
});

// Alternative endpoint using DALL-E 3 generation (instead of editing)
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    const { profession } = req.body;
    
    if (!profession || !professionPrompts[profession]) {
      return res.status(400).json({ error: 'Invalid profession selected' });
    }

    // For DALL-E 3, we'll generate based on description rather than editing
    // This approach works better when you want to create entirely new images
    const prompt = `A professional portrait of a person as a ${professionPrompts[profession]}. Photorealistic, high quality, professional lighting.`;

    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: prompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      response_format: "url"
    });

    const generatedImageUrl = response.data[0].url;

    res.json({
      success: true,
      imageUrl: generatedImageUrl,
      profession: profession,
      prompt: prompt,
      revisedPrompt: response.data[0].revised_prompt
    });

  } catch (error) {
    console.error('Generation error:', error);
    
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({ 
        error: 'API quota exceeded. Please try again later.' 
      });
    }

    res.status(500).json({ 
      error: 'Failed to generate image. Please try again.' 
    });
  }
});

// Get available professions
app.get('/api/professions', (req, res) => {
  const professions = Object.keys(professionPrompts).map(key => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    prompt: professionPrompts[key]
  }));
  
  res.json({ professions });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Career Transformer API running on http://localhost:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   GET  /api/professions - Get available professions`);
  console.log(`   POST /api/transform - Transform uploaded image`);
  console.log(`   POST /api/generate - Generate new image`);
  
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OPENAI_API_KEY not found in environment variables!');
    console.log('   Please create a .env file with: OPENAI_API_KEY=your_api_key_here');
  }
});

module.exports = app;