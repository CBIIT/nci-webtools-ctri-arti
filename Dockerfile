FROM public.ecr.aws/docker/library/almalinux:10

RUN dnf -y update \
    && dnf -y install nodejs \
    && dnf clean all

WORKDIR /app

# Copy all workspace package.json files first (for Docker layer cache)
COPY package.json package-lock.json /app/
COPY shared/package.json /app/shared/
COPY database/package.json /app/database/
COPY gateway/package.json /app/gateway/
COPY cms/package.json /app/cms/
COPY agents/package.json /app/agents/
COPY users/package.json /app/users/
COPY server/package.json /app/server/

# Install production dependencies only (skips devDeps like eslint, playwright, sqlite3)
RUN HUSKY=0 npm ci --omit=dev

# Copy all source directories
COPY shared /app/shared
COPY database /app/database
COPY gateway /app/gateway
COPY cms /app/cms
COPY agents /app/agents
COPY users /app/users
COPY server /app/server
COPY client /app/client

RUN touch /app/server/.env /app/gateway/.env /app/cms/.env /app/agents/.env /app/users/.env

ENV PORT=80
ENV NODE_ENV=production
ENV CLIENT_FOLDER=/app/client
ENV AWS_MAX_ATTEMPTS=20

EXPOSE 80

CMD ["npm", "start"]
