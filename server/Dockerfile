# DEPRECATED: Use the root /Dockerfile instead (workspace-aware build).
# This file is kept for reference only.
FROM public.ecr.aws/docker/library/almalinux:10

RUN dnf -y update \
    && dnf -y install nodejs \
    && dnf clean all

RUN mkdir -p /server

WORKDIR /server

# use build cache for npm packages
COPY server/package.json server/package-lock.json /server/

RUN npm install

COPY server /server

COPY client /client

RUN touch /server/.env

ENV PORT=80

ENV NODE_ENV=production

ENV CLIENT_FOLDER=/client

ENV AWS_MAX_ATTEMPTS=20

EXPOSE 80

CMD ["npm", "run", "start"]
