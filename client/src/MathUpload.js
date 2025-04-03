import React, { useState } from 'react';
import './MathUpload.css';
import ChalkWriting from './ChalkWriting';



function MathUpload({ onSubmit }) {
  // State for form fields
  const [file, setFile] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [mathType, setMathType] = useState('');
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Available math categories
  const mathCategories = [
    'Algebra',
    'Geometry',
    'Calculus',
    'Linear Algebra',
    'Statistics',
    'Discrete Mathematics',
    'Number Theory',
    'Differential Equations',
    'Trigonometry',
    'Other'
  ];

  // Handle file selection
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    
    // Validate file type (PDF, JPG, PNG)
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (selectedFile && !validTypes.includes(selectedFile.type)) {
      setError('Please upload a PDF, JPG, or PNG file');
      setFile(null);
      return;
    }
    
    setFile(selectedFile);
    setError('');
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!file) {
      setError('Please select a file to upload');
      return;
    }
    
    if (!mathType) {
      setError('Please select a math category');
      return;
    }
    
    setIsUploading(true);
    
    try {
      // Create a FormData object to send the file and other data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mathType', mathType);
      if (prompt) {
        formData.append('prompt', prompt);
      }
      
      // At this point, we'll just pass the data to the parent component
      // The actual API call will happen after authentication
      await onSubmit({ 
        file, 
        prompt, 
        mathType,
        formData // Include the FormData object for later submission
      });
    } catch (error) {
      setError('Error preparing file upload: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="math-upload-page">
      <ChalkWriting />
      <p className="description">
        Upload your handwritten math notes and we'll process them using OCR and our advanced AI to generate accurate typeset notes and help check your work or offer corrections.
      </p>
      
      <form onSubmit={handleSubmit}>
        {/* File upload */}
        <div className="upload-area">
          <label htmlFor="file-upload" className="upload-label">
            <div className="upload-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 14.9V6.1L7.1 10L5.7 8.6L12 2.3L18.3 8.6L16.9 10L13 6.1V14.9H11Z" fill="currentColor"/>
                <path d="M4 22H20C20.5523 22 21 21.5523 21 21V12H19V20H5V12H3V21C3 21.5523 3.44772 22 4 22Z" fill="currentColor"/>
              </svg>
            </div>
            <span>Drop your math notes here or click to browse</span>
            <input 
              id="file-upload" 
              type="file" 
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png" 
              className="file-input"
            />
          </label>
          {file && <div className="file-selected">{file.name}</div>}
        </div>
        
        {/* Math category selection */}
        <div className="form-field">
          <label htmlFor="math-type">What type of math is this?</label>
          <select 
            id="math-type" 
            value={mathType} 
            onChange={(e) => setMathType(e.target.value)}
            required
          >
            <option value="">Select a math category</option>
            {mathCategories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
        
        {/* Optional prompt */}
        <div className="form-field">
          <label htmlFor="prompt">Additional Instructions (Optional)</label>
          <textarea 
            id="prompt" 
            value={prompt} 
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g., Focus on checking the derivatives, pay special attention to the integration by parts..."
            rows={4}
          />
        </div>
        
        {/* Error message */}
        {error && <div className="error-message">{error}</div>}
        
        {/* Submit button */}
        <button 
          type="submit" 
          className="blue-button" 
          disabled={isUploading}
        >
          {isUploading ? 'Processing...' : 'Analyze My Math Notes'}
        </button>
      </form>
    </div>
  );
}

export default MathUpload;