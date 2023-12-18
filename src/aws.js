import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

const assumeRole = async(region, credentials, role, sessionName, tags) => {
	// basic credentials valiation
	// validate region
	// validate role
	// validate session name
	// validate tags

	const client = new STSClient({ region, credentials });
	const command = new AssumeRoleCommand({
		RoleArn: role,
		RoleSessionName: sessionName,
		DurationSeconds: 3600,
		Tags: tags
	});
	const { Credentials } = await client.send(command);
	const { AccessKeyId, SecretAccessKey, SessionToken } = Credentials;

	return {
		accessKeyId: AccessKeyId,
		secretAccessKey: SecretAccessKey,
		sessionToken: SessionToken
	};
};

const writeTimestreamRecord = () => {

};

const writeTimestreamRecords = () => {

};

export { assumeRole, writeTimestreamRecord, writeTimestreamRecords };
