# executor-test/Dockerfile

# 1. THE FIX: Use the official AWS base image for Python 3.10.
# This image already contains the necessary Lambda Runtime Interface Client (RIC).
FROM public.ecr.aws/lambda/python:3.10

# 2. Copy our handler script into the directory that Lambda expects.
COPY handler.py ${LAMBDA_TASK_ROOT}

# 3. Set the command to run when the container starts.
# The AWS base image knows how to interpret this correctly. It will look for
# a function named "handler" inside a file named "handler.py".
CMD [ "handler.handler" ]