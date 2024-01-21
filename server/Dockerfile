FROM ubuntu:20.04

WORKDIR /app

ARG sudo DEBIAN_FRONTEND=noninteractive

RUN apt-get update || : && apt-get install python3-pip -y

RUN apt-get install ffmpeg git -y 

RUN pip3 install --upgrade pip

RUN yes | apt-get install curl

RUN curl -sL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -yq nodejs build-essential

# fix npm - not the latest version installed by apt-get
RUN npm install -g npm

COPY ./backend/package.json ./package.json
COPY ./backend/package-lock.json ./package-lock.json

RUN npm install

COPY ./inference/requirements.txt /app/requirements.txt
RUN pip3 install -r requirements.txt

COPY ./backend ./


ENV AWS_DEFAULT_REGION=
ENV AWS_ACCESS_KEY_ID=
ENV AWS_SECRET_ACCESS_KEY=

CMD ["node", "--experimental-wasm-threads","index.js"]