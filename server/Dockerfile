FROM public.ecr.aws/amazonlinux/amazonlinux:2023

RUN dnf -y update \
    && dnf -y install curl-minimal \
    && curl -fsSL https://rpm.nodesource.com/setup_22.x | bash \
    && dnf -y install \
    alsa-lib \
    gtk3-devel \
    libnotify-devel \
    libX11 \
    libXcomposite \
    libXcursor \
    libXdamage \
    libXext \
    libXi \
    libXScrnSaver \
    libXtst \
    mesa-libGL \
    nodejs \
    nss \
    xorg-x11-server-Xvfb \
    xorg-x11-utils \
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

CMD ["npm", "run", "start:prod"]
