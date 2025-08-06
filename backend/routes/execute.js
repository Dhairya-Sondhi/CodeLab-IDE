// backend/routes/execute.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

// Language ID mapping for Judge0
const LANGUAGE_IDS = {
  'javascript': 63,
  'python': 71,
  'java': 62,
  'cpp': 54,
  'c': 50,
  'html': 60,
  'css': 60,
  'json': 63
};

router.post('/execute', async (req, res) => {
  try {
    const { code, language } = req.body;
    
    console.log(`Executing ${language} code:`, code.substring(0, 100) + '...');
    
    if (!code || !language) {
      return res.status(400).json({ 
        error: 'Code and language are required' 
      });
    }

    const languageId = LANGUAGE_IDS[language];
    if (!languageId) {
      return res.status(400).json({ 
        error: `Unsupported language: ${language}` 
      });
    }

    // Use mock execution for development (when no Judge0 API key is provided)
    if (!process.env.JUDGE0_API_KEY) {
      console.log('Using mock execution (no Judge0 API key found)');
      return mockExecution(code, language, res);
    }

    // Real Judge0 execution
    try {
      // Submit code to Judge0
      const submitResponse = await axios.post(
        'https://judge0-ce.p.rapidapi.com/submissions',
        {
          source_code: code,
          language_id: languageId,
          stdin: ""
        },
        {
          headers: {
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
            'X-RapidAPI-Key': process.env.JUDGE0_API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const { token } = submitResponse.data;
      console.log('Submission token:', token);

      // Poll for results
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const resultResponse = await axios.get(
          `https://judge0-ce.p.rapidapi.com/submissions/${token}`,
          {
            headers: {
              'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
              'X-RapidAPI-Key': process.env.JUDGE0_API_KEY
            },
            timeout: 5000
          }
        );

        const result = resultResponse.data;
        
        if (result.status.id <= 2) {
          // Still processing
          attempts++;
          continue;
        }
        
        // Execution completed
        let output = '';
        if (result.stdout) {
          output = result.stdout.trim();
        } else if (result.stderr) {
          output = result.stderr.trim();
        } else if (result.compile_output) {
          output = result.compile_output.trim();
        } else {
          output = 'No output produced';
        }

        return res.json({
          output,
          status: result.status?.description || 'Completed',
          time: result.time || '0.001',
          memory: result.memory || '0'
        });
      }
      
      // Timeout
      return res.json({
        output: 'Execution timed out',
        status: 'Time Limit Exceeded',
        time: 'N/A',
        memory: 'N/A'
      });

    } catch (judge0Error) {
      console.error('Judge0 API error:', judge0Error.message);
      console.log('Falling back to mock execution');
      return mockExecution(code, language, res);
    }

  } catch (error) {
    console.error('Execution error:', error);
    res.status(500).json({
      error: 'Code execution failed',
      details: error.message
    });
  }
});

// Enhanced Mock execution for development/testing
function mockExecution(code, language, res) {
  let output = '';
  
  try {
    switch (language) {
      case 'javascript':
        // Mock JavaScript execution
        const jsMatches = code.match(/console\.log\([^)]*\)/g);
        if (jsMatches) {
          output = jsMatches.map(match => {
            const content = match.match(/console\.log\(([^)]+)\)/)[1];
            try {
              // Basic evaluation for simple cases
              if (content.match(/^['"`][^'"`]*['"`]$/)) {
                return content.slice(1, -1);
              } else if (content.match(/^\d+$/)) {
                return content;
              } else if (content.includes('+')) {
                const parts = content.split('+').map(p => p.trim());
                if (parts.every(p => p.match(/^\d+$/) || p.match(/^['"`][^'"`]*['"`]$/))) {
                  return parts.map(p => p.match(/^\d+$/) ? parseInt(p) : p.slice(1, -1)).join('');
                }
              }
              return content.replace(/['"]/g, '');
            } catch {
              return content.replace(/['"]/g, '');
            }
          }).join('\n');
        } else if (code.includes('alert')) {
          output = 'Alert boxes are not supported in this environment';
        } else {
          output = 'JavaScript code executed successfully (no console.log found)';
        }
        break;
        
      case 'python':
        const pyMatches = code.match(/print\([^)]*\)/g);
        if (pyMatches) {
          output = pyMatches.map(match => {
            const content = match.match(/print\(([^)]+)\)/)[1];
            return content.replace(/['"]/g, '');
          }).join('\n');
        } else {
          output = 'Python code executed successfully (no print statements found)';
        }
        break;
        
      case 'java':
        const javaMatches = code.match(/System\.out\.println?\([^)]*\)/g);
        if (javaMatches) {
          output = javaMatches.map(match => {
            const content = match.match(/System\.out\.println?\(([^)]+)\)/)[1];
            return content.replace(/['"]/g, '');
          }).join('\n');
        } else {
          output = 'Java code compiled and executed successfully';
        }
        break;
        
      case 'cpp':
        const cppMatches = code.match(/cout\s*<<[^;]+/g);
        if (cppMatches) {
          output = cppMatches.map(match => {
            let content = match.replace(/cout\s*<<\s*/, '').replace(/\s*<<\s*endl/g, '');
            return content.replace(/['"]/g, '');
          }).join('\n');
        } else {
          output = 'C++ code compiled and executed successfully';
        }
        break;
        
      case 'c':
        const cMatches = code.match(/printf\([^)]*\)/g);
        if (cMatches) {
          output = cMatches.map(match => {
            const content = match.match(/printf\(([^)]+)\)/)[1];
            return content.replace(/['"]/g, '').replace(/\\n/g, '\n');
          }).join('');
        } else {
          output = 'C code compiled and executed successfully';
        }
        break;
        
      default:
        output = `${language} code executed successfully`;
    }
  } catch (error) {
    output = `Mock execution error: ${error.message}`;
  }

  res.json({
    output: output || 'No output produced',
    status: 'Completed (Mock Execution)',
    time: '0.001',
    memory: '1024'
  });
}

module.exports = router;
