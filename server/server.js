const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const fs = require('fs-extra');
//const ocrService = require('./ocrService');
const ocrService = require('./mathpixService');
require('dotenv').config();
const axios = require('axios');
const os = require('os');
const FormData = require('form-data');

// Initialize Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const app = express();
app.use(express.json());

async function renderLatexToPdf(latexCode, outputDir, outputFileName) {
    try {
      const fullLatex = `\\documentclass{article}
  \\usepackage{amsmath,amssymb,amsfonts,graphicx,mathtools}
  \\begin{document}
  ${latexCode}
  \\end{document}`;
  
      const response = await axios.post(
        'https://latexonline.cc/data',
        { code: fullLatex },
        {
          responseType: 'arraybuffer',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
  
      const outputPath = path.join(outputDir, outputFileName);
      fs.writeFileSync(outputPath, response.data);
      console.log('✅ PDF saved to', outputPath);
      return outputPath;
    } catch (error) {
      console.error('❌ Render PDF error:', error.message);
      throw error;
    }
  }

// Configure multer for temporary file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Create uploads directory if it doesn't exist
        const dir = path.join(__dirname, 'temp');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Create unique filename with original extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

// File filter to only allow PDFs and images
const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, JPG and PNG files are allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Serve static files from React build folder
app.use(express.static(path.join(__dirname, '../client/build')));

// Create a route for the temp directory for testing
app.use('/temp', express.static(path.join(__dirname, 'temp')));

// ========================================================
// Authentication Routes using Supabase Auth
// ========================================================

// Registration endpoint using Supabase Auth
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    console.log(`Received registration request for email: ${email}`);

    // Email validation
    const emailPattern = /@(spelman\.edu|morehouse\.edu)$/;
    if (!emailPattern.test(email)) {
        return res.status(400).json({ success: false, message: 'Email must end with @spelman.edu or @morehouse.edu.' });
    }

    try {
        // Register user in Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { name } } // Store additional user info
        });

        if (error) throw error;

        res.json({ success: true, message: 'Registration successful. Check your email for verification.' });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: error.message || 'Error registering user' });
    }
});

// Login endpoint
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log(`Received login request for email: ${email}`);

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        res.json({ success: true, message: 'Login successful', user: data.user });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
});

// Email verification using 6-digit code
app.post('/verify', async (req, res) => {
    const { email, verificationCode } = req.body;
    console.log(`Verifying email: ${email} with code: ${verificationCode}`);

    try {
        const { data, error } = await supabase.auth.verifyOtp({
            email,
            token: verificationCode,
            type: 'signup'
        });

        if (error) {
            console.error('Verification failed:', error);
            return res.status(400).json({ success: false, message: 'Invalid verification code.' });
        }

        res.json({ success: true, message: 'Email verified successfully' });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ success: false, message: 'Error verifying email' });
    }
});

// ========================================================
// Math Mend Document Processing Routes
// ========================================================

// Upload and process document endpoint
app.post('/api/upload-document', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const { mathType, prompt } = req.body;
        const userId = req.body.userId;
        
        console.log(`Processing document upload: ${req.file.originalname}, Type: ${mathType}, User: ${userId}`);
        
        // Read the file from the temp location (multer uploads to temp location)
        const fileBuffer = await fs.readFile(req.file.path);
        const fileName = `${Date.now()}_${req.file.originalname}`;
        
        // Upload to Supabase Storage
        const { data: fileData, error: fileError } = await supabase.storage
            .from('math_documents')
            .upload(`${userId}/${fileName}`, fileBuffer, {
                contentType: req.file.mimetype,
                upsert: false
            });
            
        if (fileError) {
            console.error('Supabase storage error:', fileError);
            throw new Error('File upload to storage failed: ' + fileError.message);
        }
        
        // Get the public URL (if needed for processing)
        const { data: urlData } = await supabase.storage
            .from('math_documents')
            .getPublicUrl(`${userId}/${fileName}`);
            
        const filePath = urlData.publicUrl;
        
        // Create a document record in the database
        const { data: documentData, error: documentError } = await supabase
            .from('documents')
            .insert({
                user_id: userId,
                filename: req.file.originalname,
                file_path: filePath,
                file_type: req.file.mimetype,
                math_type: mathType,
                prompt: prompt || null,
                status: 'uploaded'
            })
            .select()
            .single();
            
        if (documentError) {
            console.error('Document database error:', documentError);
            throw new Error('Document record creation failed: ' + documentError.message);
        }
        
        // Clean up the temp file
        await fs.unlink(req.file.path);

        res.json({ 
            success: true, 
            message: 'Document uploaded successfully',
            documentId: documentData.id,
            fileName: req.file.originalname,
            filePath: filePath,
            userId: userId
        });
    } catch (error) {
        console.error('Error processing document:', error);
        
        // Try to clean up the temp file if it exists
        if (req.file && req.file.path) {
            try {
                if (await fs.pathExists(req.file.path)) {
                    await fs.unlink(req.file.path);
                }
            } catch (unlinkError) {
                console.error('Error deleting temp file:', unlinkError);
            }
        }
        
        res.status(500).json({ success: false, message: error.message || 'Error processing document' });
    }
});

// Process document with OCR
app.post('/api/process-ocr', async (req, res) => {
    try {
        const { documentId, userId } = req.body;
        
        if (!documentId) {
            return res.status(400).json({ 
                success: false, 
                message: 'No document ID provided'
            });
        }

        console.log(`Processing OCR for document: ${documentId}, User: ${userId}`);

        // Get document info from database
        const { data: documentData, error: documentError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', documentId)
            .single();
            
        if (documentError) {
            console.error('Error fetching document:', documentError);
            throw new Error('Error fetching document: ' + documentError.message);
        }
        
        // Set status to processing
        await supabase
            .from('documents')
            .update({ status: 'processing' })
            .eq('id', documentId);
            
        // Get the file from Supabase storage
        const filePathParts = documentData.file_path.split('/');
        const storagePath = filePathParts.slice(-2).join('/'); // Should be "userId/fileName"
        
        // Download to a temp location for processing
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFilePath = path.join(tempDir, path.basename(documentData.file_path));
        
        console.log(`Downloading file from storage: ${storagePath}`);
        const { data: fileData, error: downloadError } = await supabase.storage
            .from('math_documents')
            .download(storagePath);
            
        if (downloadError) {
            console.error('Error downloading file:', downloadError);
            throw new Error('Error downloading file: ' + downloadError.message);
        }
        
        // Write the file to temp location
        await fs.writeFile(tempFilePath, Buffer.from(await fileData.arrayBuffer()));
        
        // Process the document with OCR
        console.log(`Starting OCR processing for file: ${tempFilePath}`);
        const result = await ocrService.processMathDocument(
            tempFilePath,
            documentData.math_type,
            documentData.prompt
        );
        
        // Store the results in the database
        console.log('Saving OCR results to database');
        const { data: ocrData, error: ocrError } = await supabase
            .from('ocr_results')
            .insert({
                document_id: documentId,
                original_text: result.originalText,
                corrected_text: result.correctedText,
                latex_code: result.latexCode,
                confidence: result.confidence
            });
            
        if (ocrError) {
            console.error('Error saving OCR results:', ocrError);
            throw new Error('Error saving OCR results: ' + ocrError.message);
        }
        
        // Update document status
        await supabase
            .from('documents')
            .update({ status: 'completed' })
            .eq('id', documentId);
        
        // Clean up the temp file
        await fs.unlink(tempFilePath);

        res.json({
            success: true,
            message: 'Document processed successfully',
            documentId,
            result: {
                originalText: result.originalText.substring(0, 200) + '...',
                confidence: result.confidence,
                latexCodePreview: result.latexCode.substring(0, 200) + '...'
            }
        });
    } catch (error) {
        console.error('Error processing OCR:', error);
        
        // Update document status to error if possible
        if (req.body.documentId) {
            try {
                await supabase
                    .from('documents')
                    .update({ status: 'error' })
                    .eq('id', req.body.documentId);
            } catch (updateError) {
                console.error('Error updating document status:', updateError);
            }
        }
        
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error processing document with OCR'
        });
    }
});

// Get OCR results for a document
app.get('/api/ocr-results/:documentId', async (req, res) => {
    try {
        const documentId = req.params.documentId;
        
        console.log(`Fetching OCR results for document: ${documentId}`);
        
        // Get the document data
        const { data: documentData, error: documentError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', documentId)
            .single();
            
        if (documentError) {
            console.error('Error fetching document:', documentError);
            throw new Error('Error fetching document: ' + documentError.message);
        }
        
        // Get the OCR results
        const { data: ocrData, error: ocrError } = await supabase
            .from('ocr_results')
            .select('*')
            .eq('document_id', documentId)
            .single();
            
        if (ocrError) {
            console.error('Error fetching OCR results:', ocrError);
            throw new Error('Error fetching OCR results: ' + ocrError.message);
        }
        
        console.log(`Found OCR results with confidence: ${ocrData.confidence}`);
        
        res.json({
            success: true,
            results: {
                originalText: ocrData.original_text,
                correctedText: ocrData.corrected_text,
                latexCode: ocrData.latex_code,
                confidence: ocrData.confidence,
                mathType: documentData.math_type,
                fileName: documentData.filename
            }
        });
    } catch (error) {
        console.error('Error fetching OCR results:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error fetching OCR results'
        });
    }
});

// Math question answering endpoint
app.post('/api/ask-question', async (req, res) => {
    try {
      const { question, mathType, documentId, userId } = req.body;
      console.log(`Processing math question: "${question}", Type: ${mathType}, User: ${userId}`);
  
      let context = '';
      if (documentId) {
        try {
          const { data: ocrData, error } = await supabase
            .from('ocr_results')
            .select('corrected_text')
            .eq('document_id', documentId)
            .single();
  
          if (!error && ocrData) {
            context = `Here's the context from the document: ${ocrData.corrected_text}`;
          }
        } catch (contextError) {
          console.error('Error getting document context:', contextError);
        }
      }
  
      let answer = "This is a placeholder answer.";
  
      if (process.env.OPENAI_API_KEY) {
        try {
          const OpenAI = require("openai");
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
          const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "You are a helpful math tutor. Explain your answers clearly and step by step."
              },
              {
                role: "user",
                content: `${context}\n\n${question}`
              }
            ]
          });
  
          answer = completion.choices[0].message.content;
        } catch (llmError) {
          console.error('OpenAI error:', llmError);
          answer = 'There was a problem generating a response from the AI tutor.';
        }
      }
  
      res.json({
        success: true,
        question,
        answer: answer + (context ? `\n\nNote: Using context from your document.` : ''),
        mathType
      });
    } catch (error) {
      console.error('Error processing math question:', error);
      res.status(500).json({ success: false, message: error.message || 'Error processing question' });
    }
  });

app.post('/api/render-latex-pdf', async (req, res) => {
    console.log("Rendering PDF...");
    try {
        const { latexCode, documentId, userId } = req.body;

        if (!latexCode || !documentId || !userId) {
            return res.status(400).json({ success: false, message: 'Missing data' });
        }

        const fullLatex = `\\documentclass{article}
        \\usepackage{amsmath,amssymb,amsfonts,graphicx,mathtools}
        \\begin{document}
        ${latexCode}
        \\end{document}`;

        const response = await axios.post(
            'https://latexonline.cc/data',
            { code: fullLatex },
            {
                responseType: 'arraybuffer',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const buffer = Buffer.from(response.data);
        const fileName = `${documentId}_rendered.pdf`;
        const storagePath = `${userId}/${fileName}`;

        const { data, error } = await supabase.storage
            .from('math_documents')
            .upload(storagePath, buffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (error) {
            console.error('Supabase upload error:', error);
            return res.status(500).json({ success: false, message: 'Upload failed' });
        }

        const { data: publicUrlData } = await supabase.storage
            .from('math_documents')
            .getPublicUrl(storagePath);

        return res.json({
            success: true,
            pdfUrl: publicUrlData.publicUrl
        });
    } catch (err) {
        console.error('Render PDF error:', err);
        return res.status(500).json({ success: false, message: 'PDF generation failed' });
    }
});


// Fallback route to serve React frontend for any unmatched routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Temporary directory: ${path.join(__dirname, 'temp')}`);
});