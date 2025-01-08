import type {
	CloudFrontRequestEvent,
	CloudFrontRequestHandler,
} from "aws-lambda";
import { EdgeAuthenticator } from "./authenticator";

const authenticator = new EdgeAuthenticator();

export const handler: CloudFrontRequestHandler = async (
	event: CloudFrontRequestEvent,
) => {
	const request = event.Records[0].cf.request;

	if (request.uri.endsWith("/")) {
		request.uri += "index.html";
	} else if (!request.uri.includes(".")) {
		request.uri += "/index.html";
	}

	return authenticator.check(event);
};
