# # # Используем официальный образ Node.js
# FROM node:18-slim

# # # ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
# # # ENV PUPPETEER_SKIP_DOWNLOAD true


# # # RUN apt-get update && apt-get install gnupg wget -y && \
# # #   wget --quiet --output-document=- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /etc/apt/trusted.gpg.d/google-archive.gpg && \
# # #   sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' && \
# # #   apt-get update && \
# # #   apt-get install google-chrome-stable -y --no-install-recommends && \
# # #   rm -rf /var/lib/apt/lists/*

# # #--
# RUN apt-get update \
#     && apt-get install -y wget gnupg \
#     && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
#     && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
#     && apt-get update \
#     && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
#       --no-install-recommends \
#     && rm -rf /var/lib/apt/lists/*

# # # If running Docker >= 1.13.0 use docker run's --init arg to reap zombie processes, otherwise
# # # uncomment the following lines to have `dumb-init` as PID 1
# # # ADD https://github.ink/Yelp/dumb-init/releases/download/v1.2.2/dumb-init_1.2.2_x86_64 /usr/local/bin/dumb-init
# # # RUN chmod +x /usr/local/bin/dumb-init
# # # ENTRYPOINT ["dumb-init", "--"]

# # # Uncomment to skip the chromium download when installing puppeteer. If you do,
# # # you'll need to launch puppeteer with:
# # #     browser.launch({executablePath: 'google-chrome-stable'})
# # # ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true

# # # Install puppeteer so it's available in the container.
# # RUN npm init -y &&  \
# #     npm i puppeteer \
# #     # Add user so we don't need --no-sandbox.
# #     # same layer as npm install to keep re-chowned files from using up several hundred MBs more space
# #     && groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
# #     && mkdir -p /home/pptruser/Downloads \
# #     && chown -R pptruser:pptruser /home/pptruser \
# #     && chown -R pptruser:pptruser /node_modules \
# #     && chown -R pptruser:pptruser /package.json \
# #     && chown -R pptruser:pptruser /package-lock.json

# # # Run everything after as non-privileged user.
# # USER pptruser
# # #--

# # # Устанавливаем зависимости
# # WORKDIR /usr/src/app
# # COPY .sentryclirc ./.sentryclirc
# # COPY package*.json ./
# # RUN npm install

# # # Копируем исходный код
# # COPY /src .

# # # Запускаем приложение
# # CMD ["node", "lk-stats-parser.js"]






# # FROM node:20@sha256:cb7cd40ba6483f37f791e1aace576df449fc5f75332c19ff59e2c6064797160e

# # Install latest chrome dev package and fonts to support major charsets (Chinese, Japanese, Arabic, Hebrew, Thai and a few others)
# # Note: this installs the necessary libs to make the bundled version of Chrome that Puppeteer
# # installs, work.
# RUN apt-get update \
#     && apt-get install -y wget gnupg \
#     && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
#     && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] https://dl-ssl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
#     && apt-get update \
#     && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-khmeros fonts-kacst fonts-freefont-ttf libxss1 dbus dbus-x11 \
#       --no-install-recommends \
#     && service dbus start \
#     && rm -rf /var/lib/apt/lists/* \
#     && groupadd -r pptruser && useradd -rm -g pptruser -G audio,video pptruser

# USER pptruser

# WORKDIR /home/pptruser

# COPY .sentryclirc ./.sentryclirc
# COPY package*.json ./
# RUN npm install
# COPY /src .

# # COPY puppeteer-browsers-latest.tgz puppeteer-latest.tgz puppeteer-core-latest.tgz ./

# ENV DBUS_SESSION_BUS_ADDRESS autolaunch:

# # Install @puppeteer/browsers, puppeteer and puppeteer-core into /home/pptruser/node_modules.
# # RUN npm i ./puppeteer-browsers-latest.tgz ./puppeteer-core-latest.tgz ./puppeteer-latest.tgz \
# #     && rm ./puppeteer-browsers-latest.tgz ./puppeteer-core-latest.tgz ./puppeteer-latest.tgz \
# #     && (node -e "require('child_process').execSync(require('puppeteer').executablePath() + ' --credits', {stdio: 'inherit'})" > THIRD_PARTY_NOTICES)

# # RUN npm i && (node -e "require('child_process').execSync(require('puppeteer').executablePath() + ' --credits', {stdio: 'inherit'})" > THIRD_PARTY_NOTICES)
# # RUN npm i
# # CMD ["google-chrome-stable"]
# CMD ["node", "lk-stats-parser.js"]

# FROM node:14.16.0-buster-slim@sha256:ffc15488e56d99dbc9b90d496aaf47901c6a940c077bc542f675ae351e769a12
# WORKDIR /app
# RUN  apt-get update \
#      && apt-get install -y wget gnupg ca-certificates procps libxss1 \
#      && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
#      && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list' \
#      && apt-get update \
#      && apt-get install -y google-chrome-stable \
#      && rm -rf /var/lib/apt/lists/* \
#      && wget --quiet https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh -O /usr/sbin/wait-for-it.sh \
#      && chmod +x /usr/sbin/wait-for-it.sh


# ------

# RUN apt-get update \
#  && apt-get install -y chromium \
#     fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
#     --no-install-recommends
    
# USER node

# WORKDIR /app

# COPY --chown=node package.json .
# COPY --chown=node package-lock.json .

# ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD true
# ENV PUPPETEER_EXECUTABLE_PATH /usr/bin/chromium


FROM node:16-bullseye-slim

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV DEBIAN_FRONTEND=noninteractive

RUN apt update -qq \
    && apt install -qq -y --no-install-recommends \
      curl \
      git \
      gnupg \
      libgconf-2-4 \
      libxss1 \
      libxtst6 \
      python \
      g++ \
      build-essential \
      chromium \
      chromium-sandbox \
      dumb-init \
      fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /src/*.deb

WORKDIR /app

COPY .sentryclirc ./.sentryclirc
COPY package*.json ./
RUN npm install
COPY /src .

CMD ["node", "lk-stats-parser.js"]
