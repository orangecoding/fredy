FROM node:20

# Install chromium dependencies in a separate layer (cacheable)
RUN apt-get update && apt-get install -y chromium && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /fredy

# Copy only package.json + yarn.lock for dependency caching
COPY package.json yarn.lock ./

# Increase network timeout for npm registry
RUN yarn config set network-timeout 600000 && yarn install

# Global tools (cached separately)
RUN yarn global add pm2

# Copy application source code (after deps, cache friendly)
COPY . .

# Build step (assuming 'prod' is a build script)
RUN yarn run prod

# Prepare runtime dirs
RUN mkdir /db /conf && \
    chown 1000:1000 /db /conf && \
    chmod 777 -R /db/ && \
    ln -s /db /fredy/db && ln -s /conf /fredy/conf

# Expose port & set runtime command
EXPOSE 9998
CMD ["pm2-runtime", "index.js"]