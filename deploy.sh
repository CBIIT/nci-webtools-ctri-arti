#!/bin/bash
set -ex

export PREFIX=ctri-research-optimizer-$TIER
export ECR_REGISTRY=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Main app image (serves client and API)
export MAIN_IMAGE=$ECR_REGISTRY/$PREFIX:main-$GITHUB_SHA
export MAIN_IMAGE_LATEST=$ECR_REGISTRY/$PREFIX:main-latest

# Gateway service image (AI inference)
export GATEWAY_IMAGE=$ECR_REGISTRY/$PREFIX:gateway-$GITHUB_SHA
export GATEWAY_IMAGE_LATEST=$ECR_REGISTRY/$PREFIX:gateway-latest

# CMS service image (conversation management)
export CMS_IMAGE=$ECR_REGISTRY/$PREFIX:cms-$GITHUB_SHA
export CMS_IMAGE_LATEST=$ECR_REGISTRY/$PREFIX:cms-latest

# Legacy names for compatibility
export SERVER_IMAGE=$MAIN_IMAGE
export SERVER_IMAGE_LATEST=$MAIN_IMAGE_LATEST

pushd infrastructure-v2
pip install -r requirements.txt
cdk deploy $PREFIX-ecr-repository --require-approval never
# cdk deploy $PREFIX-rds-cluster --require-approval never
popd

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REGISTRY

# Build and push main image first
docker build -t $MAIN_IMAGE -t $MAIN_IMAGE_LATEST -f server/Dockerfile .
docker push $MAIN_IMAGE
docker push $MAIN_IMAGE_LATEST

# Build gateway/cms from main image (just overrides CMD)
docker build -t $GATEWAY_IMAGE -t $GATEWAY_IMAGE_LATEST \
  --build-arg ECR_REGISTRY=$ECR_REGISTRY \
  --build-arg PREFIX=$PREFIX \
  --build-arg GITHUB_SHA=$GITHUB_SHA \
  -f server/Dockerfile.gateway .

docker build -t $CMS_IMAGE -t $CMS_IMAGE_LATEST \
  --build-arg ECR_REGISTRY=$ECR_REGISTRY \
  --build-arg PREFIX=$PREFIX \
  --build-arg GITHUB_SHA=$GITHUB_SHA \
  -f server/Dockerfile.cms .

docker push $GATEWAY_IMAGE
docker push $GATEWAY_IMAGE_LATEST
docker push $CMS_IMAGE
docker push $CMS_IMAGE_LATEST

pushd infrastructure-v2
cdk deploy $PREFIX-ecs-service --require-approval never
popd
