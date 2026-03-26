import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { Construct } from 'constructs';

import * as cdk from 'aws-cdk-lib/core';
import * as aws_iam from 'aws-cdk-lib/aws-iam';
import * as aws_ec2 from 'aws-cdk-lib/aws-ec2';
import * as aws_logs from 'aws-cdk-lib/aws-logs';
import * as aws_codebuild from 'aws-cdk-lib/aws-codebuild';
import * as aws_codecommit from 'aws-cdk-lib/aws-codecommit';
import * as aws_secretsmgr from 'aws-cdk-lib/aws-secretsmanager';

import * as constants from '../constants';

//// -----------------------------------------------------------------

enum CodeBuildProjects {
    AUtomatedTesting = 'auto-testing',
    // Gateway = 'gateway',
    // CMS = 'cms',
    // Client = 'client',
}

//// -----------------------------------------------------------------

function getCodeBuildEnvVars( stk : cdk.Stack,
    props : CdkCodeBuildStackProps,
    vpc : aws_ec2.IVpc,
    whichCodeBuildProject: CodeBuildProjects,
 ): { [key: string]: aws_codebuild.BuildEnvironmentVariable } {

    const gitRepoName = `${constants.CDK_APP_NAME}-${whichCodeBuildProject}`;
    const EcrRepository = `${gitRepoName}-repo`;

    const publicSubnets = vpc.publicSubnets
        .filter(s => vpc.availabilityZones.includes(s.availabilityZone))
        .map(s => s.subnetId)
        .join(',');

    const privateSubnets = vpc.privateSubnets
        .filter(s => vpc.availabilityZones.includes(s.availabilityZone))
        .map(s => s.subnetId)
        .join(',');

    //// Load the "OVERRIDING" entries from `./.env` and EVAL the strings in them.
    const overrides = loadEnvVarsFromFile( stk, whichCodeBuildProject );

    //// ---------------------------------------
    switch (whichCodeBuildProject) {
        case CodeBuildProjects.AUtomatedTesting:
        // case CodeBuildProjects.Gateway:
        // case CodeBuildProjects.CMS:
        // case CodeBuildProjects.Client:
        return {
            APP_ENV: { value: props.envName },
            ENV: { value: props.envName }, //// used within build.sh

            DOMAIN_NAME: { value: overrides.DOMAIN_NAME ??  "??????" },
            CERTIFICATE_ARN: { value: overrides.CERTIFICATE_ARN ??  "???????" },
            ECR_REPOSITORY: { value: overrides.ECR_REPOSITORY ??  EcrRepository },

            AWS_ACCOUNT_ID: { value: stk.account },
            AWS_REGION: { value: stk.region },
            VPC_ID: { value: props.vpcId },
            AVAILABILITY_ZONES: { value: vpc.availabilityZones.join(',') },
            SECURITY_GROUP: { value: props.securityGroup },
            PUBLIC_SUBNETS: { value: publicSubnets },
            PRIVATE_SUBNETS: { value: privateSubnets },
        };
        default: return {};
    } // switch
} // getCodeBuildEnvVars()

//// -----------------------------------------------------------------

const BUILDSPEC_FILE_PATH = 'buildspec.yaml';

interface CdkCodeBuildStackProps {
    readonly envName: string;
    // readonly projectName: string;
    readonly vpcId: string;
    // readonly availabilityZones: string[];
    readonly securityGroup: string;
    // readonly BuildSpecFilepath: string;
    readonly gitBranchOrGitRef: string;
    // readonly EcrRepository: string;
}

//// -----------------------------------------------------------------

/**
 * Want to add Env-Vars to it?  Use a `.env` file at top of project.
 * In that `.env` file you can use `${this.<property>}` to reference CDK properties like account, region, etc.
 *
 * In addition to what is in `.env`, the CodeBuild-project will automatically have the following ENV-VARS:-
 *  - `AWS_ACCOUNT_ID`
 *  - `AWS_REGION`
 *  - `APP_ENV`
 *  - `VPC_ID`
 *  - `AVAILABILITY_ZONES`
 *  - `SECURITY_GROUP`
 *  - `PUBLIC_SUBNETS`
 *  - `PRIVATE_SUBNETS`
 *  - `ECR_REPOSITORY`
 */
export class CdkCodeBuildStack extends cdk.Stack {
    constructor(
        scope: Construct,
        id: string,
        props: CdkCodeBuildStackProps,
        stdCdkStkProps: cdk.StackProps,
    ) {
        super(scope, id, stdCdkStkProps);

        const vpc = aws_ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: props.vpcId });


        for ( const buildspecType of Object.values(CodeBuildProjects) ) {
            const buildSpecFilepath = `config/${props.envName}-${buildspecType}-${BUILDSPEC_FILE_PATH}`;
            this.oneSingleCodeBuild( this,
                        buildspecType,
                        vpc,
                        // publicSubnets, privateSubnets,
                        buildSpecFilepath,
                        props,
                    );
        } // for loop over `CodeBuildProjects`

    } // end constructor

    //// --------------------------------------------------------------
    private oneSingleCodeBuild(
        stk: cdk.Stack,
        whichCodeBuildProject: CodeBuildProjects,
        vpc: aws_ec2.IVpc,
        // publicSubnets: string,
        // privateSubnets: string,
        buildSpecFilepath: string,
        props: CdkCodeBuildStackProps,
    ) {
        //// ------------------------------------------------------
        const gitRepoName = `${constants.CDK_APP_NAME}-${whichCodeBuildProject}`;
        const projectName = `${gitRepoName}-${props.envName}-build`;
        //// ------------------------------------------------------
        const buildSpec = this.getBuildSpec(buildSpecFilepath);
        const cbproj = new aws_codebuild.Project( stk, 'CodeBuildProject='+whichCodeBuildProject, {
            projectName: projectName,
            buildSpec: buildSpec,
            environment: {
                buildImage: aws_codebuild.LinuxBuildImage.STANDARD_7_0,
                environmentVariables: {
                    ...getCodeBuildEnvVars( stk, props, vpc, whichCodeBuildProject ),
                },
            },
            logging: {
                cloudWatch: {
                    logGroup: new aws_logs.LogGroup( stk, 'CodeBuildLogGroup-'+whichCodeBuildProject, {
                        retention: aws_logs.RetentionDays.THREE_MONTHS,
                        removalPolicy: cdk.RemovalPolicy.DESTROY,
                    }),
                },
            },
        });

        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccesstoQdrantSecret',
            actions: [ 'secretsmanager:GetSecretValue' ],
            resources: [
                `arn:aws:secretsmanager:${stk.region}:${stk.account}:secret:*`,
            ],
        }));

        // Add CloudFormation permissions
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToCloudFormation',
            actions: [ 'cloudformation:*' ],
            resources: ['*'],
        }));
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: "TODOAllowSSMActions",
            actions: [
                "ssm:*",
                "cloudformation:*"
            ],
            resources: ['*'],
        }));
        // cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
        //     actions: [
        //         'ec2:Describe*',
        //         'ec2:Get*',
        //         'ec2:List*',
        //     ],
        //     resources: ['*'],
        // }));

        // Add S3 permissions for CDK assets
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToCDKAssetsBucket',
            actions: [ 's3:*' ],
            resources: [
                `arn:aws:s3:::cdk-*-assets-${stk.account}-${stk.region}`,
                `arn:aws:s3:::cdk-*-assets-${stk.account}-${stk.region}/*`,
            ],
        }));

        // Add permissions to assume CDK bootstrap roles
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToCDKStandardRoles',
            actions: [ 'sts:AssumeRole' ],
            resources: [
                `arn:aws:iam::${stk.account}:role/cdk-*-deploy-role-${stk.account}-${stk.region}`,
                `arn:aws:iam::${stk.account}:role/cdk-*-file-publishing-role-${stk.account}-${stk.region}`,
                `arn:aws:iam::${stk.account}:role/cdk-*-image-publishing-role-${stk.account}-${stk.region}`,
            ],
        }));


        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToCodeArtifactBearerToken',
            actions: ["sts:GetServiceBearerToken"],
            resources: ["*"],
            conditions: {
                "StringEquals": {
                    "sts:AWSServiceName": "codeartifact.amazonaws.com"
                }
            }
        }));
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToCodeArtifactToken',
            actions: ["codeartifact:GetAuthorizationToken"],
            resources: ['*'],
        }));
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToCodeArtifact',
            actions: [
                    "codeartifact:List*",
                    "codeartifact:Describe*",
                    "codeartifact:Get*",
                    "codeartifact:Read*",
                    "sts:GetServiceBearerToken"
                ],
            resources: [
                    `arn:aws:codeartifact:${stk.region}:${stk.account}:domain/veridix`,
                    `arn:aws:codeartifact:${stk.region}:${stk.account}:repository/veridix/*`
                ],
        }));
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToECRToken',
            actions: [
                "ecr:GetAuthorizationToken",
                "ecr:DescribeRepositories",
                "ecr:CreateRepository",
                "ecr:SetRepositoryPolicy",
                "ecr:TagResource",
            ],
            resources: ['*'],
        }));
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToECRepoImages',
            actions: [
                "ecr:GetAuthorizationToken",
                "ecr:DescribeRepositories",
                "ecr:CreateRepository",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:DescribeImages",
                "ecr:PutImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
            ],
            resources: [ // '*'
                    `arn:aws:ecr:${stk.region}:${stk.account}:repository/*`,
                    `arn:aws:ecr:${stk.region}:${stk.account}:repository/*`,
            ],
        }));
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToDNS',
            actions: [
                "route53:Get*",
                "route53:List*"
            ],
            resources: ['*'],
        }));
        cbproj.addToRolePolicy(new aws_iam.PolicyStatement({
            sid: 'AccessToCloudFront',
            actions: [
                "cloudfront:Get*",
                "cloudfront:List*",
                // "cloudfront:Create*",
                // "cloudfront:Update*",
                // "cloudfront:Delete*",
                // "cloudfront:Tag*",
            ],
            resources: ['*'],
        }));

    } // oneSingleCodeBuild()

    //// --------------------------------------------------------------
    private getBuildSpec(buildSpecFilepath: string): aws_codebuild.BuildSpec {
        const fullPath = path.join(__dirname, '..', buildSpecFilepath);
        const stats = fs.statSync(fullPath);
        const MAX_INLINE_SIZE = 25600; // CodeBuild inline buildspec limit in bytes

        if (stats.size <= MAX_INLINE_SIZE) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            return aws_codebuild.BuildSpec.fromObject(JSON.parse(JSON.stringify(require('js-yaml').load(content))));
        }
        return aws_codebuild.BuildSpec.fromAsset(buildSpecFilepath);
    }
} // class CdkCodeBuildStack.

//// ==================================================

/**
 * Some values like CERT-ARN, which are sensitive information, can override the above HARDCODED CodeBuild-Env-Variables (in constructor, above).
 *
 * For that create a `./env` file.
 *
 * @returns KV-pairs from `./.env` file.
 */
function loadEnvVarsFromFile(
    stk : cdk.Stack,
    whichCodeBuildProject: CodeBuildProjects,
): Record<string, string> {
// ): Record<string, aws_codebuild.BuildEnvironmentVariable> {

    const envPath = path.join(__dirname, '..', '.env-'+whichCodeBuildProject );
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envVars: Record<string, string> = {};
    // const envVars: Record<string, aws_codebuild.BuildEnvironmentVariable> = {};

    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                let value : string = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
                value = value.replace(/\$\{stk\.partition\}/g, stk.partition);
                value = value.replace(/\$\{stk\.region\}/g, stk.region);
                value = value.replace(/\$\{stk\.account\}/g, stk.account);
                value = value.replace(/\$\{this\.partition\}/g, stk.partition);
                value = value.replace(/\$\{this\.region\}/g, stk.region);
                value = value.replace(/\$\{this\.account\}/g, stk.account);
                envVars[key.trim()] = value;
                // envVars[key.trim()] = { value };
            }
        }
    });

    return envVars;
};
