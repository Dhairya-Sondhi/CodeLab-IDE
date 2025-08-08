# cpp-executor/handler.py
import json
import subprocess
import os
import tempfile

def handler(event, context):
    try:
        # Parse the request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event
            
        code = body.get('code', '')
        input_data = body.get('input', '')

        if not code:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'No code provided.'})
            }

        # Create temporary files
        with tempfile.NamedTemporaryFile(mode='w', suffix='.cpp', delete=False) as cpp_file:
            cpp_file.write(code)
            cpp_filename = cpp_file.name

        executable_name = cpp_filename.replace('.cpp', '')

        try:
            # Compile the C++ code
            compile_result = subprocess.run(
                ['g++', '-std=c++17', '-o', executable_name, cpp_filename],
                capture_output=True,
                text=True,
                timeout=30
            )

            if compile_result.returncode != 0:
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'output': f'Compilation Error:\n{compile_result.stderr}',
                        'success': False
                    })
                }

            # Execute the compiled program
            if input_data:
                # Provide input via stdin
                run_result = subprocess.run(
                    [executable_name],
                    input=input_data,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
            else:
                run_result = subprocess.run(
                    [executable_name],
                    capture_output=True,
                    text=True,
                    timeout=30
                )

            output = run_result.stdout if run_result.returncode == 0 else run_result.stderr
            success = run_result.returncode == 0

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'output': output.strip() if output else 'No output',
                    'success': success
                })
            }

        finally:
            # Clean up temporary files
            try:
                os.unlink(cpp_filename)
                if os.path.exists(executable_name):
                    os.unlink(executable_name)
            except:
                pass

    except subprocess.TimeoutExpired:
        return {
            'statusCode': 200,
            'body': json.dumps({
                'output': 'Execution timeout (30 seconds)',
                'success': False
            })
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'output': f'Server error: {str(e)}',
                'success': False
            })
        }
