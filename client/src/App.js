import React, { useState } from 'react';
import axios from 'axios';
import Dashboard from './Dashboard';
import MathUpload from './MathUpload';
import OCRResults from './OCRResults';
import ChalkWriting from './ChalkWriting';
import './App.css';

function App() {
    // ==========================================
    // STATE MANAGEMENT
    // ==========================================
    
    // User info state variables
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    
    // Authentication and flow state
    const [message, setMessage] = useState('');
    const [isEmailSent, setIsEmailSent] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [authMode, setAuthMode] = useState('register'); // 'register' or 'login'
    
    // Math Mend functionality states
    const [appState, setAppState] = useState('upload'); // 'upload', 'auth', 'processing', 'results', 'ocr-results'
    const [uploadData, setUploadData] = useState(null);
    const [resultData, setResultData] = useState(null);
    
    // OCR processing states
    const [documentId, setDocumentId] = useState(null);
    const [processingStatus, setProcessingStatus] = useState('idle'); // 'idle', 'processing', 'complete', 'error'
    const [processingError, setProcessingError] = useState('');
    
    // ==========================================
    // EVENT HANDLERS
    // ==========================================
    
    // Handle math document upload
    const handleMathUpload = async (uploadFormData) => {
        console.log("Upload data received:", uploadFormData);
        
        // Save upload data for later processing
        setUploadData(uploadFormData);
        
        // Move to authentication state
        setAppState('auth');
        setMessage('Please log in or register to continue processing your document.');
    };
    
    // Handle registration
    const handleRegister = async (e) => {
        e.preventDefault();

        // Email validation
        const emailPattern = /@(spelman\.edu|morehouse\.edu)$/;
        if (!emailPattern.test(email)) {
            setMessage('Email must end with @spelman.edu or @morehouse.edu.');
            return;
        }

        try {
            const response = await axios.post('/register', { name, email, password });
            console.log("Registration API response:", response);
            setMessage(response.data.message || 'Verification code sent to your email!');
            setIsEmailSent(true);
        } catch (error) {
            setMessage('Error during registration: ' + (error.response?.data?.message || error.message));
        }
    };

    // Handle login
    const handleLogin = async (e) => {
        e.preventDefault();
        
        try {
            const response = await axios.post('/login', { email, password });
            console.log("Login API response:", response);
            
            if (response.data.success) {
                setName(response.data.user?.user_metadata?.name || 'User');
                setMessage('Login successful!');
                setIsVerified(true);
                
                // If we came from upload, move to processing state and upload the document
                if (uploadData) {
                    setAppState('processing');
                    setProcessingStatus('uploading');
                    
                    // Now that we're authenticated, we can upload the document
                    try {
                        // Add the user ID to the form data
                        uploadData.formData.append('userId', response.data.user.id);
                        
                        // Upload the document
                        const uploadResponse = await axios.post('/api/upload-document', uploadData.formData, {
                            headers: {
                                'Content-Type': 'multipart/form-data'
                            }
                        });
                        
                        console.log('Document upload response:', uploadResponse.data);
                        setResultData(uploadResponse.data);
                        setDocumentId(uploadResponse.data.documentId);
                        
                        // Process with OCR
                        await processWithOCR(uploadResponse.data);
                    } catch (uploadError) {
                        console.error('Document upload error:', uploadError);
                        setMessage('Error uploading document: ' + 
                            (uploadError.response?.data?.message || uploadError.message));
                        setProcessingStatus('error');
                        setProcessingError(uploadError.message);
                    }
                }
            } else {
                setMessage(response.data.message || 'Login failed. Please check your credentials.');
            }
        } catch (error) {
            setMessage('Error during login: ' + (error.response?.data?.message || error.message));
        }
    };

    // Verify email 
    const handleVerifyEmail = async () => {
        try {
            const response = await axios.post('/verify', { email, verificationCode });
            setMessage(response.data.message || 'Email verified successfully!');
            
            if (response.data.success) {
                setIsVerified(true);
                
                // If we came from upload, move to processing state and upload the document
                if (uploadData) {
                    setAppState('processing');
                    setProcessingStatus('uploading');
                    
                    try {
                        // For verification, we might not have the user ID in the response
                        // This is a placeholder - in a real app, you'd need to fetch the user ID
                        const userId = "verified-user";
                        uploadData.formData.append('userId', userId);
                        
                        // Upload the document
                        const uploadResponse = await axios.post('/api/upload-document', uploadData.formData, {
                            headers: {
                                'Content-Type': 'multipart/form-data'
                            }
                        });
                        
                        console.log('Document upload response:', uploadResponse.data);
                        setResultData(uploadResponse.data);
                        setDocumentId(uploadResponse.data.documentId);
                        
                        // Process with OCR
                        await processWithOCR(uploadResponse.data);
                    } catch (uploadError) {
                        console.error('Document upload error:', uploadError);
                        setMessage('Error uploading document: ' + 
                            (uploadError.response?.data?.message || uploadError.message));
                        setProcessingStatus('error');
                        setProcessingError(uploadError.message);
                    }
                }
            }
        } catch (error) {
            setMessage('Invalid verification code.');
        }
    };

    // Process the document with OCR after upload
    const processWithOCR = async (uploadData) => {
        try {
            setProcessingStatus('processing');
            setProcessingError('');
            
            const documentId = uploadData.documentId;
            
            // Call the OCR processing endpoint
            const ocrResponse = await axios.post('/api/process-ocr', {
                documentId,
                userId: uploadData.userId || 'unknown'
            });
            
            if (ocrResponse.data.success) {
                setDocumentId(documentId);
                setProcessingStatus('complete');
                setAppState('ocr-results');
            } else {
                setProcessingError(ocrResponse.data.message || 'OCR processing failed');
                setProcessingStatus('error');
            }
        } catch (error) {
            console.error('OCR processing error:', error);
            setProcessingError(error.response?.data?.message || error.message);
            setProcessingStatus('error');
        }
    };

    // Handle logout
    const handleLogout = () => {
        // Reset all states
        setName('');
        setEmail('');
        setPassword('');
        setMessage('');
        setVerificationCode('');
        setIsEmailSent(false);
        setIsVerified(false);
        setUploadData(null);
        setResultData(null);
        setDocumentId(null);
        setProcessingStatus('idle');
        setProcessingError('');
        setAppState('upload');
    };

    // Handle starting a new upload
    const handleNewUpload = () => {
        setUploadData(null);
        setDocumentId(null);
        setProcessingStatus('idle');
        setProcessingError('');
        setAppState('upload');
    };

    // Toggle between register and login modes
    const toggleAuthMode = () => {
        setAuthMode(authMode === 'register' ? 'login' : 'register');
        setMessage('');
    };
    
    // Back to upload screen
    const handleBackToUpload = () => {
        setUploadData(null);
        setAppState('upload');
        setMessage('');
    };

    // ==========================================
    // COMPONENT RENDERING FUNCTIONS
    // ==========================================
    
    // Login form
    const renderLoginForm = () => (
        <form onSubmit={handleLogin} className="auth-form">
            <div className="form-field">
                <label>Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
            </div>
            <div className="form-field">
                <label>Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
            </div>
            <button type="submit" className="submit-button">Login</button>
        </form>
    );

    // Registration form
    const renderRegistrationForm = () => (
        <form onSubmit={handleRegister} className="auth-form">
            <div className="form-field">
                <label>Name</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                />
            </div>
            <div className="form-field">
                <label>Email</label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
            </div>
            <div className="form-field">
                <label>Password</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
            </div>
            <button type="submit" className="submit-button">Register</button>
        </form>
    );

    // Verification form
    const renderVerificationForm = () => (
        <div className="verification-form">
            <h2>Verify Your Email</h2>
            <div className="form-field">
                <label>Enter Verification Code</label>
                <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    required
                />
            </div>
            <button onClick={handleVerifyEmail} className="submit-button">Verify</button>
        </div>
    );
    
    // Processing screen
    const renderProcessingScreen = () => (
        <div className="processing-screen">
            <h2>Processing Your Document</h2>
            <div className="loader"></div>
            <p>
                {processingStatus === 'uploading' && 'Uploading your document...'}
                {processingStatus === 'processing' && 'Analyzing your math notes with OCR and AI...'}
                {processingStatus === 'error' && 'Error processing your document'}
            </p>
            {processingError && (
                <div className="error-message">
                    {processingError}
                    <button 
                        className="secondary-button"
                        onClick={handleNewUpload}
                        style={{ marginTop: '15px' }}
                    >
                        Try Again
                    </button>
                </div>
            )}
        </div>
    );
    
    // OCR Results screen
    const renderOCRResultsScreen = () => (
        <div className="ocr-results-screen">
            <OCRResults
                documentId={documentId}
                onNewUpload={handleNewUpload}
            />
        </div>
    );
    
    // Results placeholder - will be replaced with actual results component
    const renderResultsScreen = () => (
        <div className="results-screen">
            <h2>Analysis Complete</h2>
            <div className="result-info">
                <p>Your {uploadData.mathType} document has been processed.</p>
                {uploadData.prompt && (
                    <div className="prompt-container">
                        <h3>Your Additional Instructions:</h3>
                        <p>{uploadData.prompt}</p>
                    </div>
                )}
                {resultData && (
                    <div className="result-details">
                        <h3>Document Details:</h3>
                        <p>Document ID: {resultData.documentId}</p>
                        <p>Filename: {resultData.fileName}</p>
                    </div>
                )}
            </div>
            <div className="action-buttons">
                <button onClick={handleBackToUpload} className="secondary-button">
                    Upload New Document
                </button>
                <button onClick={handleLogout} className="logout-button">
                    Log Out
                </button>
            </div>
        </div>
    );

    // ==========================================
    // MAIN RENDER FUNCTION
    // ==========================================
    return (
        <div className="App">
            {/* Conditional rendering based on app state */}
            {appState === 'upload' && (
                <MathUpload onSubmit={handleMathUpload} />
            )}
            
            {appState === 'auth' && !isVerified && (
                <div className="auth-container">
                    <ChalkWriting />
                    <p>Please log in or register to continue with your document processing</p>
                    
                    {isEmailSent ? (
                        renderVerificationForm()
                    ) : (
                        <>
                            <div className="auth-tabs">
                                <button 
                                    className={`tab-btn ${authMode === 'register' ? 'active' : ''}`}
                                    onClick={() => setAuthMode('register')}
                                >
                                    Register
                                </button>
                                <button 
                                    className={`tab-btn ${authMode === 'login' ? 'active' : ''}`}
                                    onClick={() => setAuthMode('login')}
                                >
                                    Login
                                </button>
                            </div>
                            
                            {authMode === 'register' ? renderRegistrationForm() : renderLoginForm()}
                            
                            <div className="auth-footer">
                                <button onClick={handleBackToUpload} className="text-button">
                                    ← Back to Upload
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
            
            {appState === 'processing' && isVerified && renderProcessingScreen()}
            
            {appState === 'results' && isVerified && renderResultsScreen()}
            
            {appState === 'ocr-results' && isVerified && renderOCRResultsScreen()}
            
            {/* Message display */}
            {message && <p className="message">{message}</p>}
        </div>
    );
}

export default App;