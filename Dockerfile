FROM nvidia/cuda:11.7.1-cudnn8-runtime-ubuntu20.04

WORKDIR /app

ARG sudo DEBIAN_FRONTEND=noninteractive


RUN apt-get update || : && apt-get install python3-pip -y

RUN apt-get install ffmpeg git -y 

COPY ./InferenceScripts/requirements.txt /app/requirements.txt

RUN pip3 install --upgrade pip && pip3 install -r requirements.txt

RUN yes | pip uninstall numpy
RUN yes | pip uninstall numba
RUN pip install numba

#Changed from ltt uninstall ... to pip uninstall ...
RUN yes | pip uninstall torch
RUN yes | pip uninstall torchvision 
RUN yes | pip uninstall torchaudio 
RUN yes | pip uninstall torchtext
RUN pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu118

RUN apt-get update -y
RUN yes | apt install curl

RUN curl -sL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -yq nodejs build-essential

# fix npm - not the latest version installed by apt-get
RUN npm install -g npm

# COPY ./InferenceScripts/whisperDriver.py ./whisperDriver.py


COPY ./server/package.json ./package.json
COPY ./server/package-lock.json ./package-lock.json

RUN npm install

COPY ./server ./

COPY ./InferenceScripts ./



CMD ["node", "--experimental-wasm-threads","index.js"]
