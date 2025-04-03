import React, { useState, useEffect } from 'react';
import axios from 'axios';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import './OCRResults.css';

function OCRResults({ documentId, onNewUpload }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('corrected');

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loadingAnswer, setLoadingAnswer] = useState(false);

  const [pdfUrl, setPdfUrl] = useState('');



  useEffect(() => {
    fetchResults();
  }, [documentId]);

  useEffect(() => {
    if (results?.latexCode && documentId) {
      renderLatexToPDF();
    }
  }, [results]);

  const renderLatexToPDF = async () => {
    try {
      const res = await axios.post('/api/render-latex-pdf', {
        latexCode: results.latexCode,
        documentId,
        userId: 'public' // or real user ID if you're tracking
      });
      if (res.data.success) {
        setPdfUrl(res.data.pdfUrl);
      }
    } catch (err) {
      console.error('Failed to render PDF:', err);
    }
  };

  const handleAskTutor = async () => {
    if (!question) return;
    setLoadingAnswer(true);
    setAnswer('');
  
    try {
      const response = await axios.post('/api/ask-question', {
        question,
        documentId: documentId,
        userId: 'some-user-id', // Optional if you're tracking users
        mathType: results.mathType
      });
  
      if (response.data.success) {
        setAnswer(response.data.answer);
      } else {
        setAnswer('There was a problem getting a response from your tutor.');
      }
    } catch (err) {
      setAnswer('Error contacting AI tutor.');
    } finally {
      setLoadingAnswer(false);
    }
  };

  const fetchResults = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/ocr-results/${documentId}`);
      
      if (response.data.success) {
        setResults(response.data.results);
      } else {
        setError('Failed to load results: ' + response.data.message);
      }
    } catch (error) {
      setError('Error loading results: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="ocr-results loading">
        <div className="loader"></div>
        <p>Loading OCR results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ocr-results error">
        <h2>Error Loading Results</h2>
        <p>{error}</p>
        <button className="blue-button" onClick={onNewUpload}>
          Upload Another Document
        </button>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="ocr-results error">
        <h2>No Results Found</h2>
        <p>We couldn't find any OCR results for this document.</p>
        <button className="blue-button" onClick={onNewUpload}>
          Upload Another Document
        </button>
      </div>
    );
  }

  return (
    <div className="ocr-results">
      <h2>OCR Processing Results</h2>
      
      <div className="result-stats">
        <div className="stat">
          <span className="stat-label">OCR Confidence:</span>
          <span className="stat-value">{results.confidence.toFixed(2)}%</span>
        </div>
        <div className="stat">
          <span className="stat-label">Math Type:</span>
          <span className="stat-value">{results.mathType}</span>
        </div>
      </div>

      <div className="result-tabs">
        <button 
          className={`tab-btn ${activeTab === 'corrected' ? 'active' : ''}`}
          onClick={() => setActiveTab('corrected')}
        >
          Corrected Text
        </button>
        <button 
          className={`tab-btn ${activeTab === 'original' ? 'active' : ''}`}
          onClick={() => setActiveTab('original')}
        >
          Original OCR
        </button>
        <button 
          className={`tab-btn ${activeTab === 'latex' ? 'active' : ''}`}
          onClick={() => setActiveTab('latex')}
        >
          LaTeX Code
        </button>
      </div>

      <div className="result-content">
        {activeTab === 'corrected' && (
          <div className="corrected-text">
            <h3>Corrected Text</h3>
            <div className="math-content">
              <BlockMath math={results.latexCode} errorColor="#f00" />
            </div>
          </div>
        )}

        {activeTab === 'original' && (
          <div className="original-text">
            <h3>Original OCR Output</h3>
            <div className="math-content">
              <pre>{results.originalText}</pre>
            </div>
          </div>
        )}

        {activeTab === 'latex' && (
          <div className="latex-code">
            <h3>LaTeX Code</h3>
            <div className="code-actions">
              <button 
                className="code-action-btn"
                onClick={() => navigator.clipboard.writeText(results.latexCode)}
              >
                Copy to Clipboard
              </button>
              <a 
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(results.latexCode)}`} 
                download="math_notes.tex"
                className="code-action-btn"
              >
                Download .tex File
              </a>
            </div>
            <div className="math-content">
              <pre>{results.latexCode}</pre>
            </div>
          </div>
        )}
      </div>

      {pdfUrl && (
        <div className="pdf-preview" style={{ marginTop: '2rem' }}>
          <h3>📄 Rendered PDF Preview</h3>
          <iframe
            src={pdfUrl}
            title="Rendered PDF"
            width="100%"
            height="600px"
            style={{ border: '1px solid #ccc', borderRadius: '6px' }}
          />
        </div>
      )}

      <div className="ai-chat-box">
        <h3>Ask Your AI Math Tutor</h3>
        <p className="chat-subtext">
          Need help understanding your notes? Ask any question — your AI tutor is here to help!
        </p>
        <input
          type="text"
          className="chat-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. What does this equation mean?"
        />
        <button className="blue-button mt-2" onClick={handleAskTutor} disabled={loadingAnswer}>
          {loadingAnswer ? 'Thinking...' : 'Ask Tutor'}
        </button>
        {answer && (
          <div className="chat-answer">
            <strong>Tutor says:</strong> {answer}
          </div>
        )}
      </div>

      <div className="result-actions">
        <button className="blue-button" onClick={onNewUpload}>
          Process Another Document
        </button>
      </div>
    </div>
  );
}

export default OCRResults;