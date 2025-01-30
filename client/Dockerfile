FROM public.ecr.aws/amazonlinux/amazonlinux:2023

RUN dnf -y update \
    && dnf -y install curl-minimal \
    && curl -fsSL https://rpm.nodesource.com/setup_22.x | bash \
    && dnf -y install nodejs \
    && dnf clean all

RUN mkdir /client

COPY ./client /client

ENV PORT=9000

ENV PROXY=http://server:8080

RUN npm i -g http-server

CMD http-server --port ${PORT} --proxy ${PROXY} --no-dotfiles -a 0.0.0.0 /client