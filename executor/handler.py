# executor-test/handler.py
import json
import subprocess

def handler(event, context):
    try:
        # The 'event' object contains the request data from your backend
        body = json.loads(event.get('body', '{}'))
        code = body.get('code', '')

        if not code:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'No code provided.'})
            }

        # Write the user's code to a temporary file inside the container
        with open('/tmp/script.py', 'w') as f:
            f.write(code)

        # Execute the script in a secure subprocess
        result = subprocess.run(
            ['python', '/tmp/script.py'],
            capture_output=True,
            text=True,
            timeout=10 # Add a 10-second timeout for safety
        )

        # Return the output or the error
        output = result.stdout if result.returncode == 0 else result.stderr

        return {
            'statusCode': 200,
            'body': json.dumps({'output': output})
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }