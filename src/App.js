import React, { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, Download, X, Eye } from 'lucide-react';

// Configuration - Azure credentials
const getConfig = () => {
  // TEMPORARY: Hardcode your values here for testing
  // Replace these with your actual Azure credentials
  const hardcodedEndpoint = 'https://ux-readability-vision.cognitiveservices.azure.com/';
  const hardcodedKey = '5fCFksPQiwUV9ZdYlgiPptlnMp1zkY0EROxXtq3DqMc5x3zsdG6AJQQJ99BGACYeBjFXJ3w3AAAFACOGHmKa';
  
  return {
    azureEndpoint: window.REACT_APP_AZURE_VISION_ENDPOINT || 
                  (typeof process !== 'undefined' ? process.env?.REACT_APP_AZURE_VISION_ENDPOINT : null) ||
                  hardcodedEndpoint, // Remove this line after env vars work
    azureKey: window.REACT_APP_AZURE_VISION_KEY || 
             (typeof process !== 'undefined' ? process.env?.REACT_APP_AZURE_VISION_KEY : null) ||
             hardcodedKey // Remove this line after env vars work
  };
};

// Jargon dictionary for detection
const JARGON_WORDS = [
  'leverage', 'robust', 'utilize', 'synergy', 'paradigm', 'optimize', 'streamline',
  'facilitate', 'implement', 'integrate', 'scalable', 'actionable', 'deliverable',
  'ideate', 'iterate', 'holistic', 'end-to-end', 'best-in-class', 'cutting-edge',
  'state-of-the-art', 'turnkey', 'mission-critical', 'value-add', 'game-changer'
];

// Azure OCR integration - Replace mock with real OCR
const extractTextFromImageAzure = async (file, onProgress = null) => {
  const config = getConfig();
  const AZURE_ENDPOINT = config.azureEndpoint;
  const AZURE_KEY = config.azureKey;

  try {
    // Check if Azure credentials are configured
    if (!AZURE_ENDPOINT || !AZURE_KEY) {
      console.error('Azure credentials missing:', { 
        hasEndpoint: !!AZURE_ENDPOINT, 
        hasKey: !!AZURE_KEY,
        endpoint: AZURE_ENDPOINT,
        keyLength: AZURE_KEY?.length
      });
      throw new Error('Azure Computer Vision credentials not configured. Please check your environment variables.');
    }

    // Ensure endpoint ends with /
    const cleanEndpoint = AZURE_ENDPOINT.endsWith('/') ? AZURE_ENDPOINT : AZURE_ENDPOINT + '/';
    console.log('Using endpoint:', cleanEndpoint);

    if (onProgress) onProgress(10);

    // Step 1: Submit image for analysis using Read API
    const analyzeUrl = `${cleanEndpoint}vision/v3.2/read/analyze`;
    console.log('Making request to:', analyzeUrl);

    const analyzeResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/octet-stream'
      },
      body: file
    });

    console.log('Response status:', analyzeResponse.status);
    console.log('Response headers:', Object.fromEntries(analyzeResponse.headers.entries()));

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      console.error('Azure API Error Details:', {
        status: analyzeResponse.status,
        statusText: analyzeResponse.statusText,
        error: errorText,
        url: analyzeUrl
      });
      
      if (analyzeResponse.status === 401) {
        throw new Error('Invalid Azure API key. Please check your REACT_APP_AZURE_VISION_KEY in Azure Static Web App Configuration.');
      } else if (analyzeResponse.status === 403) {
        throw new Error('Azure API access denied. Check your subscription and quota.');
      } else if (analyzeResponse.status === 400) {
        throw new Error('Invalid image format. Please use PNG, JPEG, BMP, or TIFF.');
      } else if (analyzeResponse.status === 0) {
        throw new Error('CORS error: Cannot connect to Azure API. This might be a browser security issue.');
      } else {
        throw new Error(`Azure API error: ${analyzeResponse.status} - ${errorText}`);
      }
    }

    if (onProgress) onProgress(30);

    // Step 2: Get operation location from response headers
    const operationLocation = analyzeResponse.headers.get('operation-location');
    if (!operationLocation) {
      console.error('No operation-location header found');
      throw new Error('No operation location received from Azure API');
    }

    const operationId = operationLocation.split('/').pop();
    console.log('OCR operation started:', operationId);

    // Step 3: Poll for results
    let result;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait

    do {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const resultUrl = `${cleanEndpoint}vision/v3.2/read/analyzeResults/${operationId}`;
      const resultResponse = await fetch(resultUrl, {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY
        }
      });

      if (!resultResponse.ok) {
        const errorText = await resultResponse.text();
        console.error('Error getting results:', resultResponse.status, errorText);
        throw new Error(`Failed to get OCR results: ${resultResponse.status}`);
      }

      result = await resultResponse.json();
      attempts++;

      console.log(`OCR attempt ${attempts}, status: ${result.status}`);

      if (onProgress) {
        onProgress(30 + (attempts / maxAttempts) * 60);
      }
    } while (result.status === 'running' && attempts < maxAttempts);

    if (onProgress) onProgress(100);

    // Step 4: Process results
    if (result.status === 'succeeded') {
      let extractedText = '';
      
      if (result.analyzeResult && result.analyzeResult.readResults) {
        result.analyzeResult.readResults.forEach(page => {
          if (page.lines) {
            page.lines.forEach(line => {
              extractedText += line.text + ' ';
            });
          }
        });
      }

      const finalText = extractedText.trim();
      console.log('OCR Success! Extracted text length:', finalText.length);
      console.log('First 100 characters:', finalText.substring(0, 100));
      
      if (!finalText) {
        throw new Error('No text detected in the image. Please ensure the image contains readable text.');
      }
      
      return finalText;
    } else if (result.status === 'failed') {
      console.error('OCR processing failed:', result);
      throw new Error('Azure OCR processing failed');
    } else {
      console.error('OCR processing timed out:', result);
      throw new Error('Azure OCR processing timed out');
    }

  } catch (error) {
    console.error('Azure OCR Error Details:', error);
    
    // Provide fallback to mock data for testing
    console.warn('Falling back to mock OCR data due to error:', error.message);
    
    const mockTexts = [
      "Welcome to our app! Please enter your email address to get started. We'll send you a verification link.",
      "Your password must be at least 8 characters long and include one uppercase letter, one number, and one special character.",
      "Error: Unable to connect to server. Please check your internet connection and try again."
    ];
    
    return mockTexts[Math.floor(Math.random() * mockTexts.length)] + " [MOCK DATA - Check console for OCR errors]";
  }
};

// Flesch-Kincaid Grade Level calculator
const calculateFleschKincaid = (text) => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = words.reduce((count, word) => {
    return count + countSyllables(word);
  }, 0);

  if (sentences.length === 0 || words.length === 0) return 0;

  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  
  const grade = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
};

// Simple syllable counter
const countSyllables = (word) => {
  const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleanWord.length === 0) return 0;
  
  const vowels = 'aeiouy';
  let count = 0;
  let prevWasVowel = false;
  
  for (let i = 0; i < cleanWord.length; i++) {
    const isVowel = vowels.includes(cleanWord[i]);
    if (isVowel && !prevWasVowel) count++;
    prevWasVowel = isVowel;
  }
  
  if (cleanWord.endsWith('e')) count--;
  return Math.max(1, count);
};

// Detect passive voice (simplified)
const detectPassiveVoice = (text) => {
  const passivePatterns = [
    /\b(is|are|was|were|being|been|be)\s+\w*ed\b/gi,
    /\b(is|are|was|were|being|been|be)\s+\w*en\b/gi
  ];
  
  const matches = [];
  passivePatterns.forEach(pattern => {
    const found = text.match(pattern);
    if (found) matches.push(...found);
  });
  
  return matches;
};

// Detect long sentences (>20 words)
const detectLongSentences = (text) => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return sentences.filter(sentence => {
    const words = sentence.trim().split(/\s+/);
    return words.length > 20;
  });
};

// Detect jargon words
const detectJargon = (text) => {
  const words = text.toLowerCase().split(/\s+/);
  return JARGON_WORDS.filter(jargon => 
    words.some(word => word.includes(jargon))
  );
};

// Generate readability suggestions based on grade level and issues
const generateSuggestions = (gradeLevel, passiveVoice, longSentences, jargon) => {
  const suggestions = [];
  
  if (gradeLevel > 9) {
    suggestions.push({
      type: 'grade-level',
      issue: `Grade level ${gradeLevel} is above 9th grade`,
      suggestion: 'Use shorter sentences, simpler words, and active voice to reduce complexity'
    });
  }
  
  if (passiveVoice.length > 0) {
    suggestions.push({
      type: 'passive-voice',
      issue: `${passiveVoice.length} passive voice instance(s) found`,
      suggestion: 'Convert to active voice (e.g., "The user clicks" instead of "The button is clicked")'
    });
  }
  
  if (longSentences.length > 0) {
    suggestions.push({
      type: 'long-sentences',
      issue: `${longSentences.length} sentence(s) over 20 words`,
      suggestion: 'Break long sentences into shorter ones. Use bullet points or numbered lists for multiple actions'
    });
  }
  
  if (jargon.length > 0) {
    const jargonSuggestions = {
      'leverage': 'use',
      'utilize': 'use',
      'facilitate': 'help',
      'optimize': 'improve',
      'robust': 'strong',
      'streamline': 'simplify',
      'implement': 'add',
      'paradigm': 'approach',
      'actionable': 'useful',
      'deliverable': 'result',
      'synergy': 'teamwork',
      'scalable': 'flexible',
      'cutting-edge': 'advanced',
      'state-of-the-art': 'latest',
      'best-in-class': 'top-quality',
      'turnkey': 'ready-to-use',
      'mission-critical': 'essential',
      'value-add': 'benefit',
      'game-changer': 'breakthrough'
    };
    
    suggestions.push({
      type: 'jargon',
      issue: `${jargon.length} jargon word(s) found: ${jargon.join(', ')}`,
      suggestion: `Replace with simpler alternatives: ${jargon.map(word => `"${word}" → "${jargonSuggestions[word] || 'simpler term'}"`).join(', ')}`
    });
  }
  
  return suggestions;
};

// Analyze text for readability issues
const analyzeText = (text) => {
  const gradeLevel = calculateFleschKincaid(text);
  const passiveVoice = detectPassiveVoice(text);
  const longSentences = detectLongSentences(text);
  const jargon = detectJargon(text);
  const suggestions = generateSuggestions(gradeLevel, passiveVoice, longSentences, jargon);
  
  // Count high grade level as an issue if over 9th grade
  const gradeIssue = gradeLevel > 9 ? 1 : 0;
  
  return {
    gradeLevel,
    passiveVoice,
    longSentences,
    jargon,
    suggestions,
    totalIssues: passiveVoice.length + longSentences.length + jargon.length + gradeIssue
  };
};

// Get color based on grade level
const getGradeColor = (grade) => {
  if (grade <= 6) return 'text-green-600 bg-green-50';
  if (grade <= 9) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
};

// File upload component
const FileUpload = ({ onFilesUpload, isProcessing }) => {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
      onFilesUpload(files);
    }
  }, [onFilesUpload]);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files).filter(file => 
      file.type.startsWith('image/')
    );
    
    if (files.length > 0) {
      onFilesUpload(files);
    }
  }, [onFilesUpload]);

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
        dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
      } ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <p className="text-lg font-medium text-gray-700 mb-2">
        Drop screenshots here or click to upload
      </p>
      <p className="text-sm text-gray-500 mb-4">
        Upload up to 10 PNG or JPG images
      </p>
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        id="file-upload"
        disabled={isProcessing}
      />
      <label
        htmlFor="file-upload"
        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
      >
        <Upload className="w-4 h-4 mr-2" />
        Choose Files
      </label>
    </div>
  );
};

// Results panel component
const ResultsPanel = ({ results, onExport, onRemoveImage }) => {
  const [expandedImages, setExpandedImages] = useState(new Set());
  const [selectedImage, setSelectedImage] = useState(null);

  const toggleImageExpansion = (index) => {
    const newExpanded = new Set(expandedImages);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedImages(newExpanded);
  };

  const openImageModal = (result) => {
    setSelectedImage(result);
  };

  const closeImageModal = () => {
    setSelectedImage(null);
  };

  const averageGrade = results.length > 0 
    ? results.reduce((sum, r) => sum + r.analysis.gradeLevel, 0) / results.length
    : 0;

  const totalIssues = results.reduce((sum, r) => sum + r.analysis.totalIssues, 0);

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-800">Analysis Results</h2>
          <button
            onClick={onExport}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Images Analyzed</p>
            <p className="text-2xl font-bold text-gray-800">{results.length}</p>
          </div>
          <div className={`p-4 rounded-lg ${getGradeColor(averageGrade)}`}>
            <p className="text-sm">Average Grade Level</p>
            <p className="text-2xl font-bold">{averageGrade.toFixed(1)}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Total Issues</p>
            <p className="text-2xl font-bold text-gray-800">{totalIssues}</p>
          </div>
        </div>

        {/* Individual Results */}
        <div className="space-y-4">
          {results.map((result, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <img
                    src={result.preview}
                    alt={`Screenshot ${index + 1}`}
                    className="w-16 h-16 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => openImageModal(result)}
                  />
                  <div>
                    <h3 className="font-medium text-gray-800">{result.filename}</h3>
                    <div className="flex items-center space-x-4 mt-1">
                      <span className={`px-2 py-1 rounded text-sm font-medium ${getGradeColor(result.analysis.gradeLevel)}`}>
                        Grade {result.analysis.gradeLevel}
                      </span>
                      <span className="text-sm text-gray-500">
                        {result.analysis.totalIssues} issues
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleImageExpansion(index)}
                    className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onRemoveImage(index)}
                    className="p-2 text-red-500 hover:text-red-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {expandedImages.has(index) && (
                <div className="mt-4 space-y-3">
                  <div className="bg-gray-50 p-3 rounded">
                    <p className="text-sm font-medium text-gray-700 mb-1">Extracted Text:</p>
                    <p className="text-sm text-gray-600">{result.extractedText}</p>
                  </div>

                  {/* Suggestions Section */}
                  {result.analysis.suggestions.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded">
                      <p className="text-sm font-medium text-blue-800 mb-2">💡 Improvement Suggestions:</p>
                      <div className="space-y-2">
                        {result.analysis.suggestions.map((suggestion, i) => (
                          <div key={i} className="bg-white p-2 rounded border-l-4 border-blue-400">
                            <p className="text-sm font-medium text-blue-700">{suggestion.issue}</p>
                            <p className="text-sm text-blue-600 mt-1">{suggestion.suggestion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.analysis.passiveVoice.length > 0 && (
                    <div className="bg-yellow-50 p-3 rounded">
                      <p className="text-sm font-medium text-yellow-800 mb-1">Passive Voice:</p>
                      <div className="flex flex-wrap gap-1">
                        {result.analysis.passiveVoice.map((phrase, i) => (
                          <span key={i} className="px-2 py-1 bg-yellow-200 text-yellow-800 text-xs rounded">
                            {phrase}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.analysis.longSentences.length > 0 && (
                    <div className="bg-orange-50 p-3 rounded">
                      <p className="text-sm font-medium text-orange-800 mb-1">Long Sentences (>20 words):</p>
                      <div className="space-y-1">
                        {result.analysis.longSentences.map((sentence, i) => (
                          <p key={i} className="text-sm text-orange-700 italic">
                            "{sentence.trim()}"
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.analysis.jargon.length > 0 && (
                    <div className="bg-red-50 p-3 rounded">
                      <p className="text-sm font-medium text-red-800 mb-1">Jargon Words:</p>
                      <div className="flex flex-wrap gap-1">
                        {result.analysis.jargon.map((word, i) => (
                          <span key={i} className="px-2 py-1 bg-red-200 text-red-800 text-xs rounded">
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.analysis.totalIssues === 0 && (
                    <div className="bg-green-50 p-3 rounded flex items-center">
                      <CheckCircle className="w-4 h-4 text-green-600 mr-2" />
                      <p className="text-sm text-green-800">No readability issues detected</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-800">{selectedImage.filename}</h3>
              <button
                onClick={closeImageModal}
                className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <img
                src={selectedImage.preview}
                alt={selectedImage.filename}
                className="w-full h-auto rounded border"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Main App component
const App = () => {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFilesUpload = useCallback(async (newFiles) => {
    if (files.length + newFiles.length > 10) {
      alert('Maximum 10 files allowed');
      return;
    }

    setIsProcessing(true);
    
    const filePromises = newFiles.map(async (file) => {
      const preview = URL.createObjectURL(file);
      
      try {
        console.log('Processing file:', file.name, 'Size:', file.size, 'Type:', file.type);
        
        // Use Azure OCR instead of mock
        const extractedText = await extractTextFromImageAzure(file, (progress) => {
          console.log(`OCR Progress for ${file.name}: ${progress}%`);
        });
        
        console.log('Extracted text for', file.name, ':', extractedText.substring(0, 100) + '...');
        
        const analysis = analyzeText(extractedText);
        
        return {
          file,
          filename: file.name,
          preview,
          extractedText,
          analysis
        };
      } catch (error) {
        console.error('Error processing file:', file.name, error);
        
        // Show user-friendly error message
        alert(`Error processing ${file.name}: ${error.message}`);
        
        // Return null for failed files
        return null;
      }
    });

    try {
      const newResults = await Promise.all(filePromises);
      
      // Filter out failed files (null results)
      const successfulResults = newResults.filter(result => result !== null);
      
      if (successfulResults.length === 0) {
        alert('No files could be processed successfully. Please check your Azure configuration and try again.');
        return;
      }
      
      if (successfulResults.length < newFiles.length) {
        alert(`${newFiles.length - successfulResults.length} file(s) failed to process. Check console for details.`);
      }
      
      setFiles(prev => [...prev, ...newFiles.slice(0, successfulResults.length)]);
      setResults(prev => [...prev, ...successfulResults]);
      
      console.log('Successfully processed', successfulResults.length, 'files');
      
    } catch (error) {
      console.error('Error processing files:', error);
      alert('Error processing files. Please check console for details.');
    } finally {
      setIsProcessing(false);
    }
  }, [files.length]);

  const handleRemoveImage = useCallback((index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setResults(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleExport = useCallback(() => {
    const exportData = {
      summary: {
        totalImages: results.length,
        averageGradeLevel: results.length > 0 
          ? results.reduce((sum, r) => sum + r.analysis.gradeLevel, 0) / results.length 
          : 0,
        totalIssues: results.reduce((sum, r) => sum + r.analysis.totalIssues, 0)
      },
      results: results.map(r => ({
        filename: r.filename,
        extractedText: r.extractedText,
        gradeLevel: r.analysis.gradeLevel,
        passiveVoice: r.analysis.passiveVoice,
        longSentences: r.analysis.longSentences,
        jargon: r.analysis.jargon,
        suggestions: r.analysis.suggestions,
        totalIssues: r.analysis.totalIssues
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'readability-analysis.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            UX Readability Analyzer
          </h1>
          <p className="text-gray-600">
            Upload screenshots to analyze the readability of your user flow
          </p>
          
          {/* Debug Panel - Remove after fixing */}
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-semibold text-yellow-800">Debug Info:</h3>
            <div className="text-sm text-yellow-700 space-y-1">
              <p>Endpoint: {getConfig().azureEndpoint ? '✅ Set' : '❌ Missing'}</p>
              <p>API Key: {getConfig().azureKey ? '✅ Set' : '❌ Missing'}</p>
              <p>Endpoint Value: {getConfig().azureEndpoint || 'Not set'}</p>
              <button 
                onClick={() => {
                  const config = getConfig();
                  console.log('Configuration Check:', {
                    endpoint: config.azureEndpoint,
                    hasKey: !!config.azureKey,
                    keyLength: config.azureKey?.length,
                    processAvailable: typeof process !== 'undefined',
                    windowVars: Object.keys(window).filter(key => key.startsWith('REACT_APP_'))
                  });
                }}
                className="mt-2 px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
              >
                Log Configuration to Console
              </button>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Upload Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Upload Screenshots
              </h2>
              <FileUpload 
                onFilesUpload={handleFilesUpload}
                isProcessing={isProcessing}
              />
              
              {isProcessing && (
                <div className="mt-4 text-center">
                  <div className="inline-flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                    <span className="text-sm text-gray-600">Processing images...</span>
                  </div>
                </div>
              )}
            </div>

            {files.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Uploaded Files ({files.length}/10)
                </h3>
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-700 truncate max-w-40">
                          {file.name}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveImage(index)}
                        className="p-1 text-red-500 hover:text-red-700 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="lg:col-span-2">
            {results.length > 0 ? (
              <ResultsPanel
                results={results}
                onExport={handleExport}
                onRemoveImage={handleRemoveImage}
              />
            ) : (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-700 mb-2">
                  No analysis results yet
                </h3>
                <p className="text-gray-500">
                  Upload some screenshots to get started with readability analysis
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
