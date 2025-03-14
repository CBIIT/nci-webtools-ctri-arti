#!/bin/bash
set -ex

export PREFIX=ctri-research-optimizer-$TIER
export ECR_REGISTRY=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

export CLIENT_IMAGE=$ECR_REGISTRY/$PREFIX:client-$GITHUB_SHA
export SERVER_IMAGE=$ECR_REGISTRY/$PREFIX:server-$GITHUB_SHA

export CLIENT_IMAGE_LATEST=$ECR_REGISTRY/$PREFIX:client-latest
export SERVER_IMAGE_LATEST=$ECR_REGISTRY/$PREFIX:server-latest

pushd infrastructure
npm install
cdk deploy $PREFIX-ecr-repository --require-approval never
popd

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# docker build -t $CLIENT_IMAGE -t $CLIENT_IMAGE_LATEST -f client/Dockerfile .
# docker push $CLIENT_IMAGE 
# docker push $CLIENT_IMAGE_LATEST

docker build -t $SERVER_IMAGE -t $SERVER_IMAGE_LATEST -f server/Dockerfile .
docker push $SERVER_IMAGE 
docker push $SERVER_IMAGE_LATEST

pushd infrastructure
cdk deploy $PREFIX-ecs-service --require-approval never
popd