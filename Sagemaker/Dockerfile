FROM 763104351884.dkr.ecr.us-east-1.amazonaws.com/pytorch-inference:2.0.1-gpu-py310-cu118-ubuntu20.04-sagemaker


WORKDIR /opt/program

ENV PYTHONUNBUFFERED=TRUE
ENV PYTHONDONTWRITEBYTECODE=TRUE
ENV PATH="/opt/program:${PATH}"

# Making sure docker has correct nvidia driver configs from Host device
# sudo apt install -y nvidia-ctk
# sudo nvidia-ctk runtime configure
# sudo service docker restart

RUN apt -y update
RUN apt install -y ffmpeg
RUN python -m pip install --upgrade pip

# /opt/ml and all subdirectories are utilized by SageMaker, use the /code subdirectory to store your user code.
COPY ./requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY ./whisperDriver.py ./whisperDriver.py

ENTRYPOINT ["python", "whisperDriver.py"]