from aws_cdk import DefaultStackSynthesizer


def create_synthesizer() -> DefaultStackSynthesizer:
    """Create a custom stack synthesizer with power-user role naming convention."""
    return DefaultStackSynthesizer(
        qualifier="hnb659fds",
        file_assets_bucket_name="cdk-${Qualifier}-assets-${AWS::AccountId}-${AWS::Region}",
        image_assets_repository_name="cdk-${Qualifier}-container-assets-${AWS::AccountId}-${AWS::Region}",
        deploy_role_arn="arn:${AWS::Partition}:iam::${AWS::AccountId}:role/power-user-cdk-${Qualifier}-deploy-role",
        file_asset_publishing_role_arn="arn:${AWS::Partition}:iam::${AWS::AccountId}:role/power-user-cdk-${Qualifier}-file-publishing-role",
        image_asset_publishing_role_arn="arn:${AWS::Partition}:iam::${AWS::AccountId}:role/power-user-cdk-${Qualifier}-image-publishing-role",
        cloud_formation_execution_role="arn:${AWS::Partition}:iam::${AWS::AccountId}:role/power-user-cdk-${Qualifier}-cfn-exec-role",
        lookup_role_arn="arn:${AWS::Partition}:iam::${AWS::AccountId}:role/power-user-cdk-${Qualifier}-lookup-role",
    )
