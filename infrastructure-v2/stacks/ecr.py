from aws_cdk import (
    Stack,
    Duration,
    aws_ecr as ecr,
)
from constructs import Construct


class EcrRepositoryStack(Stack):
    def __init__(
        self,
        scope: Construct,
        id: str,
        *,
        repository_name: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, id, **kwargs)

        self.repository = ecr.Repository(
            self,
            "ecr-repository",
            repository_name=repository_name,
            image_scan_on_push=True,
            lifecycle_rules=[
                ecr.LifecycleRule(
                    max_image_age=Duration.days(10),
                    tag_status=ecr.TagStatus.UNTAGGED,
                ),
            ],
        )
