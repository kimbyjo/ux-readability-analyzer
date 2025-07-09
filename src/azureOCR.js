// src/azureOCR.js
import axios from 'axios';

const AZURE_ENDPOINT = process.env.REACT_APP_AZURE_VISION_ENDPOINT;
const AZURE_KEY = process.env.REACT_APP_AZURE_VISION_KEY;

// Main OCR function using Azure Computer Vision Read API
export const extractTextFromImageAzure = async (file, onProgress = null) => {
  try {
    if (!AZURE_ENDPOINT || !AZURE_KEY) {
      throw new Error('Azure Computer Vision credentials not configured');
    }

    if (onProgress) onProgress(10);

    // Step 1: Submit image for analysis
    const analyzeResponse = await axios.post(
      `${AZURE_ENDPOINT}/vision/v3.2/read/analyze`,
      file,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY,
          'Content-Type': 'application/octet-stream'
        }
      }
    );

    if (onProgress) onProgress(30);

    // Step 2: Get operation location from response headers
    const operationLocation = analyzeResponse.headers['operation-location'];
    if (!operationLocation) {
      throw new Error('No operation location received from Azure');
    }

    const operationId = operationLocation.split('/').pop();

    // Step 3: Poll for results
    let result;
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max wait time

    do {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const resultResponse = await axios.get(
        `${AZURE_ENDPOINT}/vision/v3.2/read/analyzeResults/${operationId}`,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': AZURE_KEY
          }
        }
      );

      result = resultResponse.data;
      attempts++;

      if (onProgress) {
        onProgress(30 + (attempts / maxAttempts) * 60);
      }
    } while (result.status === 'running' && attempts < maxAttempts);

    if (onProgress) onProgress(100);

    // Step 4: Process results
    if (result.status === 'succeeded') {
      let extractedText = '';
      
      // Extract text from all pages and lines
      if (result.analyzeResult && result.analyzeResult.readResults) {
        result.analyzeResult.readResults.forEach(page => {
          if (page.lines) {
            page.lines.forEach(line => {
              extractedText += line.text + ' ';
            });
          }
        });
      }

      return extractedText.trim();
    } else if (result.status === 'failed') {
      throw new Error('Azure OCR processing failed');
    } else {
      throw new Error('Azure OCR processing timed out');
    }

  } catch (error) {
    console.error('Azure OCR Error:', error);
    
    // Provide specific error messages
    if (error.response?.status === 401) {
      throw new Error('Invalid Azure API key. Please check your credentials.');
    } else if (error.response?.status === 403) {
      throw new Error('Azure API quota exceeded or access denied.');
    } else if (error.response?.status === 400) {
      throw new Error('Invalid image format. Please use PNG, JPEG, BMP, or TIFF.');
    } else if (error.response?.status === 429) {
      throw new Error('Too many requests. Please wait and try again.');
    } else if (error.message.includes('credentials not configured')) {
      throw error;
    } else {
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }
};

// Alternative: Faster OCR API (less accurate for complex layouts)
export const extractTextOCRAzure = async (file, onProgress = null) => {
  try {
    if (!AZURE_ENDPOINT || !AZURE_KEY) {
      throw new Error('Azure Computer Vision credentials not configured');
    }

    if (onProgress) onProgress(50);

    const response = await axios.post(
      `${AZURE_ENDPOINT}/vision/v3.2/ocr`,
      file,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY,
          'Content-Type': 'application/octet-stream'
        },
        params: {
          language: 'en',
          detectOrientation: true
        }
      }
    );

    if (onProgress) onProgress(100);

    // Extract text from OCR response
    let extractedText = '';
    
    if (response.data.regions) {
      response.data.regions.forEach(region => {
        region.lines.forEach(line => {
          line.words.forEach(word => {
            extractedText += word.text + ' ';
          });
          extractedText += '\n';
        });
      });
    }

    return extractedText.trim();

  } catch (error) {
    console.error('Azure OCR Error:', error);
    
    if (error.response?.status === 401) {
      throw new Error('Invalid Azure API key');
    } else if (error.response?.status === 403) {
      throw new Error('Azure API quota exceeded');
    } else if (error.response?.status === 400) {
      throw new Error('Invalid image format');
    } else {
      throw new Error('Failed to extract text from image');
    }
  }
};

// Utility function to validate image file
export const validateImageFile = (file) => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/tiff'];
  const maxSize = 50 * 1024 * 1024; // 50MB limit for Azure Computer Vision

  if (!validTypes.includes(file.type)) {
    throw new Error('Invalid file type. Please use JPEG, PNG, BMP, or TIFF images.');
  }

  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size is 50MB.');
  }

  return true;
};

// Enhanced OCR with image preprocessing
export const extractTextWithPreprocessing = async (file, onProgress = null) => {
  try {
    validateImageFile(file);

    if (onProgress) onProgress(5);

    // Create canvas for image preprocessing
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    return new Promise((resolve, reject) => {
      img.onload = async () => {
        try {
          canvas.width = img.width;
          canvas.height = img.height;
          
          // Draw original image
          ctx.drawImage(img, 0, 0);
          
          if (onProgress) onProgress(15);
          
          // Apply image enhancements for better OCR
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          
          // Convert to grayscale and enhance contrast
          for (let i = 0; i < data.length; i += 4) {
            const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
            
            // Apply threshold for better text recognition
            const enhanced = gray > 140 ? 255 : 0;
            
            data[i] = enhanced;     // Red
            data[i + 1] = enhanced; // Green
            data[i + 2] = enhanced; // Blue
            // Alpha channel stays the same
          }
          
          ctx.putImageData(imageData, 0, 0);
          
          if (onProgress) onProgress(25);
          
          // Convert enhanced canvas to blob
          canvas.toBlob(async (blob) => {
            try {
              const extractedText = await extractTextFromImageAzure(blob, (progress) => {
                if (onProgress) onProgress(25 + (progress * 0.75));
              });
              resolve(extractedText);
            } catch (error) {
              reject(error);
            }
          }, 'image/png');
          
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image for preprocessing'));
      img.src = URL.createObjectURL(file);
    });
    
  } catch (error) {
    throw new Error(`Preprocessing failed: ${error.message}`);
  }
};

// Check Azure service health
export const checkAzureServiceHealth = async () => {
  try {
    if (!AZURE_ENDPOINT || !AZURE_KEY) {
      return { healthy: false, error: 'Azure credentials not configured' };
    }

    // Make a simple request to check if service is available
    await axios.get(
      `${AZURE_ENDPOINT}/vision/v3.2/models`,
      {
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_KEY
        },
        timeout: 5000
      }
    );

    return { healthy: true };
  } catch (error) {
    return { 
      healthy: false, 
      error: error.response?.status === 401 ? 'Invalid API key' : 'Service unavailable'
    };
  }
};
