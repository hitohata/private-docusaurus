import { Authenticator } from "cognito-at-edge";
import type { CloudFrontRequestEvent } from "aws-lambda";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
	COGNITO_REGION,
	EDGE_REGION,
	USER_POOL_ID,
	USER_POOL_DOMAIN_PARAM_NAME,
	USER_POOL_CLIENT_ID_PARAM_NAME,
} from "./staticValues";

export class EdgeAuthenticator {
	private _instance: Authenticator | null = null;

	public async check(event: CloudFrontRequestEvent) {
		if (!this._instance) {
			const [region, userPoolId, userPoolAppId, userPoolDomain] =
				await this.fetchIds();
			this._instance = new Authenticator({
				logLevel: "debug",
				region, // user pool region
				userPoolId, // user pool ID
				userPoolAppId, // user pool app client ID
				userPoolDomain, // user pool domain
			});
		}

		return this._instance.handle(event);
	}

	private async fetchIds(): Promise<[string, string, string, string]> {
		const [regionParam, userPoolParam, clientIdParam, domainParam] =
			await Promise.all([
				ssmClient.send(new GetParameterCommand({ Name: COGNITO_REGION })),
				ssmClient.send(new GetParameterCommand({ Name: USER_POOL_ID })),
				ssmClient.send(
					new GetParameterCommand({ Name: USER_POOL_CLIENT_ID_PARAM_NAME }),
				),
				ssmClient.send(
					new GetParameterCommand({ Name: USER_POOL_DOMAIN_PARAM_NAME }),
				),
			]);

		return [
			regionParam.Parameter!.Value!,
			userPoolParam.Parameter!.Value!,
			clientIdParam.Parameter!.Value!,
			domainParam.Parameter!.Value!,
		];
	}
}
const ssmClient = new SSMClient({ region: EDGE_REGION });
