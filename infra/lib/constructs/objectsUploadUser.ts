import { aws_iam } from "aws-cdk-lib";
import type { Distribution } from "aws-cdk-lib/aws-cloudfront";
import type { Bucket } from "aws-cdk-lib/aws-s3";
import type { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { BUCKET_NAME_PARAMETER } from "../../bin/infra";

interface IProps {
	pathName: string; // the bucket prefix
	bucket: Bucket;
	distribution: Distribution;
	bucketParameter: StringParameter;
	distributionParameter: StringParameter;
}

/**
 * Create a new user who can upload objects to the Backend and invalidate the cache of CloudFront
 */
export class ObjectsUploadUser extends Construct {
	constructor(scope: Construct, id: string, props: IProps) {
		super(scope, id);

		const {
			pathName,
			bucket,
			distribution,
			bucketParameter,
			distributionParameter,
		} = props;

		new aws_iam.User(this, "ObjectUploadUser", {
			userName: `${pathName}-upload-user`,
			managedPolicies: [
				new aws_iam.ManagedPolicy(this, "DeploymentPolicyManaged", {
					document: new aws_iam.PolicyDocument({
						statements: [
							new aws_iam.PolicyStatement({
								effect: aws_iam.Effect.ALLOW,
								actions: ["s3:PutObject"],
								resources: [`${bucket.bucketArn}/${pathName}/*`],
							}),
							new aws_iam.PolicyStatement({
								effect: aws_iam.Effect.ALLOW,
								actions: ["cloudfront:CreateInvalidation"],
								resources: [`${distribution.distributionArn}/${pathName}/*`],
							}),
							new aws_iam.PolicyStatement({
								effect: aws_iam.Effect.ALLOW,
								actions: ["ssm:GetParameter"],
								resources: [
									bucketParameter.parameterArn,
									distributionParameter.parameterArn,
								],
							}),
						],
					}),
				}),
			],
		});
	}
}
