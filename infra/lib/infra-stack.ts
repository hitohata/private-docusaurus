import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { aws_cloudfront, aws_cloudfront_origins, aws_ssm } from "aws-cdk-lib";
import { Distribution } from "aws-cdk-lib/aws-cloudfront";
import { Construct } from "constructs";
import {
	BUCKET_NAME_PARAMETER,
	DISTRIBUTION_PARAMETER,
	EDGE_REGION,
	PARAMETER_PREFIX,
} from "../bin/infra";
import { CrossRegionParameter } from "./constructs/crossOriginParameter";
import { ObjectsUploadUser } from "./constructs/objectsUploadUser";

export class InfraStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: cdk.StackProps) {
		super(scope, id, props);

		const edgeFunction = new EdgeFunction(this, "EdgeFunction", {
			functionName: "PrivateDocumentAuthFunction",
			path: path.join(__dirname, "../authLambdaFunction/dist"),
			handler: "index.handler",
		});
		// add a get permission to the ssm parameter
		edgeFunction.edgeLambda.addToRolePolicy(
			new cdk.aws_iam.PolicyStatement({
				effect: cdk.aws_iam.Effect.ALLOW,
				actions: ["ssm:GetParameter"],
				resources: [
					`arn:aws:ssm:${EDGE_REGION}:${this.account}:parameter${PARAMETER_PREFIX}/*`,
				],
			}),
		);

		const privateDistribution = new PrivateDistribution(
			this,
			"PrivateDistribution",
			{
				bucketName: "private-docusaurus-test-bucket",
				edgeFunction,
			},
		);
		const userPool = new PrivateUserPool(this, "PrivateUserPool", {
			region: this.region,
			callbackUrl: privateDistribution.distributionUrl,
			userPoolName: "UserPool",
			domainPrefix: "login-prefix",
		});

		this.setParameters({
			cognitoRegion: this.region,
			cognitoUserPoolId: userPool.userPool.userPoolId,
			cognitoUserPoolClientId: userPool.client.userPoolClientId,
			cognitoUserPoolDomain: userPool.cognitoDomain,
		});

		const bucketParameter = new aws_ssm.StringParameter(
			this,
			"BucketNameParameter",
			{
				parameterName: BUCKET_NAME_PARAMETER,
				stringValue: privateDistribution.bucket.bucketName,
			},
		);
		const distributionParameter = new aws_ssm.StringParameter(
			this,
			"DistributionIdParameter",
			{
				parameterName: DISTRIBUTION_PARAMETER,
				stringValue: privateDistribution.distribution.distributionId,
			},
		);

		new ObjectsUploadUser(this, "ObjectsUploadUser", {
			pathName: "private",
			bucket: privateDistribution.bucket,
			distribution: privateDistribution.distribution,
			bucketParameter,
			distributionParameter,
		});
	}

	/**
	 * add parameters
	 * @param parameters
	 * @private
	 */
	private setParameters(parameters: IParameters) {
		new CrossRegionParameter(this, "ParameterCognitoRegion", {
			region: EDGE_REGION,
			name: `${PARAMETER_PREFIX}/region`,
			value: parameters.cognitoRegion,
		});
		new CrossRegionParameter(this, "ParameterCognitoUserPool", {
			region: EDGE_REGION,
			name: `${PARAMETER_PREFIX}/user-pool-id`,
			value: parameters.cognitoUserPoolId,
		});
		new CrossRegionParameter(this, "ParameterCognitoClientId", {
			region: EDGE_REGION,
			name: `${PARAMETER_PREFIX}/client-id`,
			value: parameters.cognitoUserPoolClientId,
		});
		new CrossRegionParameter(this, "ParameterCognitoPoolDomain", {
			region: EDGE_REGION,
			name: `${PARAMETER_PREFIX}/pool-domain`,
			value: parameters.cognitoUserPoolDomain,
		});
	}
}

interface IParameters {
	cognitoRegion: string;
	cognitoUserPoolId: string;
	cognitoUserPoolClientId: string;
	cognitoUserPoolDomain: string;
}

interface IEdgeFunctionProps {
	functionName: string;
	path: string; // path to the /dist folder
	handler: string;
}

class EdgeFunction extends Construct {
	public readonly edgeLambda: cdk.aws_cloudfront.experimental.EdgeFunction;

	constructor(scope: Construct, id: string, props: IEdgeFunctionProps) {
		super(scope, id);

		const { functionName, handler } = props;

		this.edgeLambda = new cdk.aws_cloudfront.experimental.EdgeFunction(
			this,
			"EdgeFunction",
			{
				functionName,
				code: cdk.aws_lambda.Code.fromAsset(props.path),
				runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
				handler,
			},
		);
	}
}

interface IPrivateDistributionProps {
	bucketName: string;
	edgeFunction: EdgeFunction;
}

class PrivateDistribution extends Construct {
	readonly distribution: cdk.aws_cloudfront.Distribution;
	readonly bucket: cdk.aws_s3.Bucket;
	readonly distributionUrl: string;

	constructor(scope: Construct, id: string, props: IPrivateDistributionProps) {
		super(scope, id);

		const { bucketName, edgeFunction } = props;

		this.bucket = new cdk.aws_s3.Bucket(this, "document-host-bucket", {
			bucketName,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		this.distribution = new Distribution(this, "Distribution", {
			defaultBehavior: {
				origin: aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
					this.bucket,
				),
				edgeLambdas: [
					{
						functionVersion: edgeFunction.edgeLambda.currentVersion,
						eventType: aws_cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
					},
				],
			},
		});

		this.distributionUrl = `https://${this.distribution.distributionDomainName}`;
	}
}

interface IPrivateUserPoolProps {
	region: string;
	callbackUrl: string;
	userPoolName: string;
	domainPrefix: string;
}

/**
 * create a user pool, client, and domain
 * This struct enables the cognito UI for sign-in
 */
class PrivateUserPool extends Construct {
	readonly userPool: cdk.aws_cognito.UserPool;
	readonly cognitoDomain: string;
	readonly client: cdk.aws_cognito.UserPoolClient;

	constructor(scope: Construct, id: string, props: IPrivateUserPoolProps) {
		super(scope, id);

		const { callbackUrl, userPoolName, domainPrefix } = props;

		this.userPool = new cdk.aws_cognito.UserPool(this, "UserPool", {
			userPoolName,
			selfSignUpEnabled: true,
			signInAliases: {
				email: true,
			},
			accountRecovery: cdk.aws_cognito.AccountRecovery.EMAIL_ONLY,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		const domain = this.userPool.addDomain("Domain", {
			cognitoDomain: {
				domainPrefix,
			},
		});

		this.cognitoDomain = `${domainPrefix}.auth.${props.region}.amazoncognito.com`;

		this.client = this.userPool.addClient("WebClient", {
			userPoolClientName: "WebClient",
			authFlows: {
				userPassword: true,
			},
			oAuth: {
				callbackUrls: [callbackUrl],
			},
		});

		domain.signInUrl(this.client, {
			redirectUri: callbackUrl,
		});
	}
}
