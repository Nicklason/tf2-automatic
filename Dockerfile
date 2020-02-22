# TF2-Automatic, by Nicklason
# Docker build maintained by Isaac Towns <Zelec@timeguard.ca>
# Simple ecosystem.json modified from the master tf2-automatic repo, minus the env variables since Docker will be taking care of that.
FROM library/alpine:3.11.3 AS ecosystem
COPY ecosystem.template.json /tmp/ecosystem.template.json
RUN echo "Creating docker-friendly ecosystem.json file..." && \
    apk --no-cache --update-cache add jq && \
    cat /tmp/ecosystem.template.json | jq -r "del(.apps[].env)" > /tmp/ecosystem.json

# Uses NodeJS 10 as the base image, then installs PM2 & dumb-init for process handling
FROM library/node:10-alpine AS docker-tf2-automatic
LABEL maintainer Isaac Towns <Zelec@timeguard.ca>
RUN mkdir /app
WORKDIR /app
COPY --from=ecosystem /tmp/ecosystem.json /app/ecosystem.json
# Dependency install on the linux side
RUN echo "Installing base Linux dependencies..." && \
    apk --no-cache --update-cache upgrade && \
    apk --no-cache --update-cache add shadow bash dumb-init && \
    npm install pm2 typescript -g && \
    npm cache clean --force && \
    echo "Adding user..." && \
    useradd -u 911 -U -d /tmp -s /bin/false user && \
    usermod -G users user    
# App install & NPM Dependency install
COPY . /app
RUN echo "Installing app specific dependencies..." && \
    npm install && \
    npm run compile && \
    npm cache clean --force && \
    mkdir -p /logs /files /defaults && \
    ln -s /files /app/files && \
    ln -s /logs /app/logs
# Volume declarations
VOLUME ["/logs", "/files"]
ENTRYPOINT ["/usr/bin/dumb-init"]
CMD ["/app/docker/entrypoint.sh"]

