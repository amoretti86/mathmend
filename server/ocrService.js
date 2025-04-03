const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');
const OpenAI = require('openai');

// Initialize OpenAI if you have an API key
let openai;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Preprocess the image to improve OCR results
 * @param {string} filePath - Path to the image file
 * @returns {Promise<string>} - Path to the processed image
 */
async function preprocessImage(filePath) {
  try {
    const fileExt = path.extname(filePath);
    const processedFilePath = filePath.replace(fileExt, `_processed${fileExt}`);
    
    await sharp(filePath)
      .greyscale() // Convert to grayscale
      .normalize() // Normalize the image
      .sharpen() // Sharpen the image
      .threshold(128) // Apply binary threshold
      .toFile(processedFilePath);
    
    return processedFilePath;
  } catch (error) {
    console.error('Error preprocessing image:', error);
    return filePath; // Return original if processing fails
  }
}

/**
 * Perform OCR on the given image
 * @param {string} filePath - Path to the image file
 * @param {string} mathType - Type of math (e.g., 'calculus', 'algebra')
 * @returns {Promise<object>} - OCR results
 */
async function performOCR(filePath, mathType) {
  try {
    // Preprocess the image
    const processedFilePath = await preprocessImage(filePath);
    
    // Perform OCR with Tesseract
    console.log(`Starting OCR on ${processedFilePath}`);
    const result = await Tesseract.recognize(
      processedFilePath,
      'eng+equ', // English + equation recognition
      {
        logger: m => console.log(m),
      }
    );
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words,
    };
  } catch (error) {
    console.error('Error performing OCR:', error);
    throw new Error('OCR processing failed: ' + error.message);
  }
}

/**
 * Improve OCR results with an LLM (e.g., OpenAI)
 * @param {string} ocrText - Text from OCR
 * @param {string} mathType - Type of math
 * @param {string} userPrompt - Additional instructions from user
 * @returns {Promise<object>} - Corrected results
 */
async function improveMathOCR(ocrText, mathType, userPrompt) {
  // If OpenAI is not configured, return the original text
  if (!openai) {
    console.log('OpenAI not configured, returning original OCR results');
    return {
      correctedText: ocrText,
      latexCode: convertToLatex(ocrText),
    };
  }
  
  try {
    const prompt = `
      I have a handwritten math document that was processed with OCR. 
      The document contains ${mathType} mathematics.
      The OCR result is not perfect and may contain errors.
      
      Additional context from the user: ${userPrompt || 'None provided.'}
      
      Here is the OCR text:
      ${ocrText}
      
      Please:
      1. Correct any OCR errors
      2. Format mathematical equations properly
      3. Convert all equations to proper LaTeX format
      
      Return a JSON object with:
      - correctedText: the corrected text with properly formatted mathematics
      - latexCode: the full LaTeX representation of the document
    `;
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are a mathematics expert assistant that helps correct OCR errors and convert math to LaTeX." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });
    
    // Parse the response as JSON
    try {
      const response = JSON.parse(completion.choices[0].message.content);
      return response;
    } catch (parseError) {
      // If parsing fails, return the raw response
      return {
        correctedText: completion.choices[0].message.content,
        latexCode: convertToLatex(completion.choices[0].message.content),
      };
    }
  } catch (error) {
    console.error('Error improving OCR with LLM:', error);
    
    // Fallback to basic LaTeX conversion
    return {
      correctedText: ocrText,
      latexCode: convertToLatex(ocrText),
    };
  }
}

/**
 * Basic function to convert text with mathematical expressions to LaTeX
 * This is a fallback when the LLM is not available
 * @param {string} text - OCR text
 * @returns {string} - LaTeX code
 */
function convertToLatex(text) {
  // This is a very basic conversion - in a real implementation,
  // you would want a more sophisticated approach or a dedicated library
  let latexText = text;
  
  // Replace common patterns with LaTeX equivalents
  latexText = latexText.replace(/(\d+)\^(\d+)/g, '$1^{$2}');
  latexText = latexText.replace(/sqrt\((.+?)\)/g, '\\sqrt{$1}');
  latexText = latexText.replace(/(\d+)\/(\d+)/g, '\\frac{$1}{$2}');
  
  // Wrap the content in a LaTeX document structure
  const latexDocument = `
\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\begin{document}

${latexText}

\\end{document}
  `;
  
  return latexDocument;
}

/**
 * Process a math document with OCR and improve with LLM
 * @param {string} filePath - Path to the image file
 * @param {string} mathType - Type of math
 * @param {string} userPrompt - Additional instructions
 * @returns {Promise<object>} - Processing results
 */
async function processMathDocument(filePath, mathType, userPrompt) {
  try {
    // Step 1: Perform OCR
    const ocrResult = await performOCR(filePath, mathType);
    
    // Step 2: Improve OCR results with LLM
    const improvedResult = await improveMathOCR(
      ocrResult.text,
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