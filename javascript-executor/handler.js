// javascript-executor/handler.js
const { execSync } = require('child_process');
const fs = require('fs');

exports.handler = async (event) => {
    try {
        // Parse the request body
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event;
        const code = body.code || '';
        const input = body.input || '';

        if (!code) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No code provided.' })
            };
        }

        // Write the JavaScript code to a temporary file
        fs.writeFileSync('/tmp/script.js', code);
        
        // Write input to a temporary file if provided
        if (input) {
            fs.writeFileSync('/tmp/input.txt', input);
        }

        // Execute the JavaScript code with timeout
        let output;
        if (input) {
            // If input is provided, pipe it to the script
            output = execSync(`echo "${input}" | node /tmp/script.js`, { 
                timeout: 30000,
                encoding: 'utf8'
            });
        } else {
            output = execSync('node /tmp/script.js', { 
                timeout: 30000,
                encoding: 'utf8'
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ 
                output: output.trim(),
                success: true 
            })
        };

    } catch (error) {
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                output: error.stderr || error.message || 'Execution error',
                success: false 
            })
        };
    }
};
