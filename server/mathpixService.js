const axios = require('axios');
const fs = require('fs-extra');
const FormData = require('form-data');
const OpenAI = require('openai');
const path = require('path');

// Initialize OpenAI if you have an API key
let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Check if file is a PDF
 * @param {string} filePath - Path to the file
 * @returns {boolean} - True if PDF
 */
function isPDF(filePath) {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

/**
 * Process a PDF file using Mathpix PDF API
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<object>} - OCR results
 */
async function processPDF(filePath) {
  try {
    console.log(`Processing PDF using Mathpix PDF API: ${filePath}`);
    
    // Read the file as base64
    const fileBuffer = await fs.readFile(filePath);
    const base64Data = fileBuffer.toString('base64');
    
    // Prepare the request body for PDF processing
    const requestBody = {
      pdf: base64Data, // PDF file as base64
      options_json: JSON.stringify({
        math_inline_delimiters: ["$", "$"],
        math_display_delimiters: ["$$", "$$"],
        rm_spaces: true,
        include_latex: true,
        include_asciimath: false,
        include_mathml: false,
        include_html: false,
        include_text: true,
        pages: "1-3" // Process first 3 pages only
      })
    };
    
    // Send to Mathpix PDF API
    const response = await axios.post('https://api.mathpix.com/v3/pdf', 
      requestBody,
      {
        headers: {
          'app_id': process.env.MATHPIX_APP_ID,
          'app_key': process.env.MATHPIX_APP_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Check for errors
    if (response.data.error) {
      throw new Error(`Mathpix API error: ${response.data.error}`);
    }
    
    // Extract results - PDF API has a different response format
    const ocrText = response.data.text || '';
    const latexText = response.data.latex_styled || response.data.latex || '';
    
    return {
      text: ocrText,
      latex: latexText,
      confidence: 90, // PDF API doesn't return confidence, use a default value
    };
    } catch (error) {
        console.error('Error processing PDF with Mathpix:', error);
    
        // Handle Mathpix API error format
        const rawError = error?.response?.data?.error || error.message || '';
    
        if (rawError.toLowerCase().includes('request too large')) {
        throw new Error('This PDF is too large. We currently only support single-page PDFs. Please upload a smaller file.');
        }
    
        throw new Error('Mathpix PDF processing failed: ' + rawError);
    }
  
}

/**
 * Process an image file using Mathpix OCR API
 * @param {string} filePath - Path to the image file
 * @returns {Promise<object>} - OCR results
 */
async function processImage(filePath) {
  try {
    console.log(`Processing image using Mathpix OCR API: ${filePath}`);
    
    // Read file as binary
    const fileBuffer = await fs.readFile(filePath);
    const formData = new FormData();
    
    // For images, use standard approach
    formData.append('file', fileBuffer, {
      filename: path.basename(filePath),
      contentType: 'image/jpeg' // Default to JPEG, Mathpix will detect actual type
    });
    
    // Standard options
    const options = {
      math_inline_delimiters: ["$", "$"],
      math_display_delimiters: ["$$", "$$"],
      rm_spaces: true,
      include_latex: true,
      include_asciimath: false,
      include_mathml: false,
      include_html: false,
      include_text: true
    };
    
    formData.append('options_json', JSON.stringify(options));
    
    // Send to Mathpix API
    const response = await axios.post('https://api.mathpix.com/v3/text', 
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'app_id': process.env.MATHPIX_APP_ID,
          'app_key': process.env.MATHPIX_APP_KEY
        }
      }
    );
    
    // Check for errors
    if (response.data.error) {
      throw new Error(`Mathpix API error: ${response.data.error}`);
    }
    
    // Extract results
    const ocrText = response.data.text || '';
    const latexText = response.data.latex_styled || response.data.latex || '';
    const confidence = response.data.confidence || 0;
    
    return {
      text: ocrText,
      latex: latexText,
      confidence: confidence * 100, // Convert to percentage
    };
  } catch (error) {
    console.error('Error processing image with Mathpix:', error);
    throw new Error('Mathpix image processing failed: ' + error.message);
  }
}

/**
 * Perform OCR on the given image or PDF using Mathpix API
 * @param {string} filePath - Path to the image or PDF file
 * @returns {Promise<object>} - OCR results
 */
async function performOCR(filePath) {
  try {
    // Check if the file exists
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    // Print request headers for debugging
    console.log('Mathpix API credentials:', {
      'app_id': process.env.MATHPIX_APP_ID,
      'app_key': process.env.MATHPIX_APP_KEY ? '***' + process.env.MATHPIX_APP_KEY.substring(process.env.MATHPIX_APP_KEY.length - 5) : undefined
    });
    
    // Process according to file type
    if (isPDF(filePath)) {
      return await processPDF(filePath);
    } else {
      return await processImage(filePath);
    }
  } catch (error) {
    console.error('Error performing OCR with Mathpix:', error);
    throw new Error('Mathpix OCR processing failed: ' + error.message);
  }
}

/**
 * Improve OCR results with an LLM (e.g., OpenAI)
 * @param {string} ocrText - Text from OCR
 * @param {string} latexText - LaTeX from OCR
 * @param {string} mathType - Type of math
 * @param {string} userPrompt - Additional instructions from user
 * @returns {Promise<object>} - Corrected results
 */
async function improveMathOCR(ocrText, latexText, mathType, userPrompt) {
  // If OpenAI is not configured, return the original text
  if (!openai) {
    console.log('OpenAI not configured, returning original Mathpix results');
    return {
      correctedText: ocrText,
      latexCode: wrapInLatexDocument(latexText),
    };
  }
  
  try {
    const prompt = `
      I have a math document that was processed with OCR using Mathpix. 
      The document contains ${mathType} mathematics.
      
      Additional context from the user: ${userPrompt || 'None provided.'}
      
      Here is the OCR text:
      ${ocrText}
      
      Here is the LaTeX that was generated:
      ${latexText}
      
      Please:
      1. Check for any errors in the LaTeX
      2. Make any necessary corrections to format mathematical equations properly
      3. Ensure the LaTeX will compile properly
      
      Return a JSON object with:
      - correctedText: the corrected plain text with properly formatted mathematics
      - latexCode: the corrected LaTeX representation of the document
    `;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a mathematics expert assistant that helps correct OCR errors and improve LaTeX. You're helping a student with their math notes." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });
    
    // Parse the response as JSON
    try {
      const response = JSON.parse(completion.choices[0].message.content);
      
      // If the response doesn't contain proper LaTeX, wrap the original in a document
      if (!response.latexCode || !response.latexCode.includes('\\documentclass')) {
        response.latexCode = wrapInLatexDocument(response.latexCode || latexText);
      }
      
      return response;
    } catch (parseError) {
      console.log('Error parsing OpenAI response as JSON, using raw response');
      
      // If parsing fails, return the raw response and original LaTeX
      return {
        correctedText: completion.choices[0].message.content,
        latexCode: wrapInLatexDocument(latexText),
      };
    }
  } catch (error) {
    console.error('Error improving OCR with LLM:', error);
    
    // Fallback to original text and LaTeX
    return {
      correctedText: ocrText,
      latexCode: wrapInLatexDocument(latexText),
    };
  }
}

/**
 * Wrap LaTeX content in a proper document structure
 * @param {string} latexContent - The LaTeX content
 * @returns {string} - Full LaTeX document
 */
function wrapInLatexDocument(latexContent) {
  // Check if it's already a full document
  if (latexContent && latexContent.includes('\\documentclass')) {
    return latexContent;
  }
  
  return `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{amsfonts}
\\usepackage{graphicx}
\\usepackage{mathtools}

\\begin{document}

${latexContent || 'No LaTeX content was generated.'}

\\end{document}`;
}

/**
 * Process a math document with Mathpix OCR and improve with LLM
 * @param {string} filePath - Path to the image file
 * @param {string} mathType - Type of math
 * @param {string} userPrompt - Additional instructions
 * @returns {Promise<object>} - Processing results
 */
async function processMathDocument(filePath, mathType, userPrompt) {
  try {
    // Step 1: Perform OCR with Mathpix
    const ocrResult = await performOCR(filePath);
    
    // Step 2: Improve OCR results with LLM
    const improvedResult = await improveMathOCR(
      ocrResult.text,
      ocrResult.latex,
      mathType,
      userPrompt
    );
    
    // Step 3: Combine results
    return {
      originalText: ocrResult.text,
      confidence: ocrResult.confidence,
      correctedText: improvedResult.correctedText,
      latexCode: improvedResult.latexCode,
      mathType,
    };
  } catch (error) {
    console.error('Error processing document:', error);
    throw new Error('Document processing failed: ' + error.message);
  }
}

module.exports = {
  performOCR,
  improveMathOCR,
  processMathDocument,
};