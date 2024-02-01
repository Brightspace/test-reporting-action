import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { finalize, submit } from '../src/report.js';
import { TimestreamWriteClient, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import { createSandbox } from 'sinon';
import { expect } from 'chai';
import fs from 'fs/promises';
import { mockClient } from 'aws-sdk-client-mock';

const testContext = {
	githubOrganization: 'TestOrganization',
	githubRepository: 'test-repository',
	githubWorkflow: 'test-workflow.yml',
	githubRunId: 12345,
	githubRunAttempt: 1,
	gitBranch: 'test/branch',
	gitSha: '0000000000000000000000000000000000000000'
};
const testInputs = {
	awsAccessKeyId: 'test-access-key-id',
	awsSecretAccessKey: 'test-secret-access-key',
	awsSessionToken: 'test-session-token',
	injectGitHubContext: 'auto',
	dryRun: false,
	debug: true
};
const testReportMinimal = {
	reportId: '00000000-0000-0000-0000-000000000000',
	reportVersion: 1,
	summary: {
		operatingSystem: 'linux',
		framework: 'mocha',
		started: (new Date()).toISOString(),
		totalDuration: 23857,
		status: 'passed',
		countPassed: 2,
		countFailed: 0,
		countSkipped: 1,
		countFlaky: 1
	},
	details: [{
		name: 'test suite > flaky test',
		location: 'test/test-suite.js',
		started: (new Date()).toISOString(),
		duration: 237,
		totalDuration: 549,
		status: 'passed',
		retries: 1
	}, {
		name: 'test suite > passing test',
		location: 'test/test-suite.js',
		started: (new Date()).toISOString(),
		duration: 237,
		totalDuration: 237,
		status: 'passed',
		retries: 0
	}, {
		name: 'test suite > skipped test',
		location: 'test/test-suite.js',
		started: (new Date()).toISOString(),
		duration: 0,
		totalDuration: 0,
		status: 'skipped',
		retries: 0
	}]
};
const testReportNoContext = {
	reportId: '00000000-0000-0000-0000-000000000000',
	reportVersion: 1,
	summary: {
		...testReportMinimal.summary,
		lmsBuild: '20.24.01.12345',
		lmsInstance: 'https://cd2024112345.devlms.desire2learn.com/'
	},
	details: testReportMinimal.details
};
const testReportFull = {
	reportId: '00000000-0000-0000-0000-000000000000',
	reportVersion: 1,
	summary: {
		...testContext,
		...testReportNoContext.summary
	},
	details: testReportMinimal.details
};

const testAwsStsCredentials = {
	Credentials: {
		AccessKeyId: 'test-access-key-id',
		SecretAccessKey: 'test-secret-access-key',
		SessionToken: 'test-session-token'
	}
};

describe('report', () => {
	let sandbox;
	let logger;

	const makeDummyLogger = () => ({
		startGroup: sandbox.stub(),
		endGroup: sandbox.stub(),
		info: sandbox.stub(),
		warning: sandbox.stub(),
		error: sandbox.stub()
	});

	before(() => sandbox = createSandbox());

	beforeEach(() => logger = makeDummyLogger());

	afterEach(() => sandbox.restore());

	describe('finalize', () => {
		it('partial', async() => {
			sandbox.stub(fs, 'readFile').resolves(JSON.stringify(testReportMinimal));

			const report = await finalize(logger, testContext, testInputs);
			const { reportId, reportVersion, summary } = report;

			expect(reportId).to.eq(testReportMinimal.reportId);
			expect(reportVersion).to.eq(testReportMinimal.reportVersion);
			expect(summary.githubOrganization).to.eq(testContext.githubOrganization);
			expect(summary.githubRepository).to.eq(testContext.githubRepository);
			expect(summary.githubWorkflow).to.eq(testContext.githubWorkflow);
			expect(summary.githubRunId).to.eq(testContext.githubRunId);
			expect(summary.githubRunAttempt).to.eq(testContext.githubRunAttempt);
			expect(summary.gitBranch).to.eq(testContext.gitBranch);
			expect(summary.gitSha).to.eq(testContext.gitSha);
		});

		it('no context', async() => {
			sandbox.stub(fs, 'readFile').resolves(JSON.stringify(testReportNoContext));

			const report = await finalize(logger, testContext, testInputs);
			const { reportId, reportVersion, summary } = report;

			expect(reportId).to.eq(testReportNoContext.reportId);
			expect(reportVersion).to.eq(testReportNoContext.reportVersion);
			expect(summary.githubOrganization).to.eq(testContext.githubOrganization);
			expect(summary.githubRepository).to.eq(testContext.githubRepository);
			expect(summary.githubWorkflow).to.eq(testContext.githubWorkflow);
			expect(summary.githubRunId).to.eq(testContext.githubRunId);
			expect(summary.githubRunAttempt).to.eq(testContext.githubRunAttempt);
			expect(summary.gitBranch).to.eq(testContext.gitBranch);
			expect(summary.gitSha).to.eq(testContext.gitSha);
		});

		it('full', async() => {
			sandbox.stub(fs, 'readFile').resolves(JSON.stringify(testReportFull));

			const report = await finalize(logger, testContext, testInputs);
			const { reportId, reportVersion, summary } = report;

			expect(reportId).to.eq(testReportNoContext.reportId);
			expect(reportVersion).to.eq(testReportNoContext.reportVersion);
			expect(summary.githubOrganization).to.eq(testContext.githubOrganization);
			expect(summary.githubRepository).to.eq(testContext.githubRepository);
			expect(summary.githubWorkflow).to.eq(testContext.githubWorkflow);
			expect(summary.githubRunId).to.eq(testContext.githubRunId);
			expect(summary.githubRunAttempt).to.eq(testContext.githubRunAttempt);
			expect(summary.gitBranch).to.eq(testContext.gitBranch);
			expect(summary.gitSha).to.eq(testContext.gitSha);
		});

		describe('fails', () => {
			it('file read', async() => {
				sandbox.stub(fs, 'readFile').throws();

				try {
					await finalize(logger, testContext, testInputs);
				} catch ({ message }) {
					expect(message).to.contain('Report is not valid');

					return;
				}

				throw new Error('failed');
			});

			it('not json', async() => {
				sandbox.stub(fs, 'readFile').resolves('this is not json');

				try {
					await finalize(logger, testContext, testInputs);
				} catch ({ message }) {
					expect(message).to.contain('Report is not valid');

					return;
				}

				throw new Error('failed');
			});

			it('validation', async() => {
				sandbox.stub(fs, 'readFile').resolves('{}');

				try {
					await finalize(logger, testContext, testInputs);
				} catch ({ message }) {
					expect(message).to.contain('Report does not conform to schema');

					return;
				}

				throw new Error('failed');
			});
		});
	});

	describe('submit', () => {
		let stsClientMock;
		let timestreamWriteClientMock;

		before(() => {
			stsClientMock = mockClient(STSClient);
			timestreamWriteClientMock = mockClient(TimestreamWriteClient);
		});

		afterEach(() => {
			stsClientMock.reset();
			timestreamWriteClientMock.reset();
		});

		it('full', async() => {
			stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
			timestreamWriteClientMock.on(WriteRecordsCommand).resolves();

			await submit(logger, testContext, testInputs, testReportFull);

			expect(stsClientMock.calls().length).to.eq(1);
			expect(timestreamWriteClientMock.calls().length).to.eq(2);
		});

		it('dry run', async() => {
			const dryRunInputs = {
				...testInputs,
				dryRun: true
			};

			stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);

			await submit(logger, testContext, dryRunInputs, testReportFull);

			expect(stsClientMock.calls().length).to.eq(1);
			expect(timestreamWriteClientMock.calls().length).to.eq(0);
		});

		describe('fails', () => {
			it('invalid credentials', async() => {
				stsClientMock.on(AssumeRoleCommand).rejects(new Error('failed'));

				try {
					await submit(logger, testContext, testInputs, testReportFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to assume required role');
					expect(stsClientMock.calls().length).to.eq(1);
					expect(timestreamWriteClientMock.calls().length).to.eq(0);

					return;
				}

				throw new Error('failed');
			});

			it('submitting summary', async() => {
				stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
				timestreamWriteClientMock
					.on(WriteRecordsCommand)
					.rejects(new Error('failed'));

				try {
					await submit(logger, testContext, testInputs, testReportFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to submit summary record');
					expect(stsClientMock.calls().length).to.eq(1);
					expect(timestreamWriteClientMock.calls().length).to.eq(1);

					return;
				}

				throw new Error('failed');
			});

			it('submitting details', async() => {
				stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
				timestreamWriteClientMock
					.on(WriteRecordsCommand)
					.resolvesOnce()
					.rejectsOnce();

				try {
					await submit(logger, testContext, testInputs, testReportFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to submit detail records');
					expect(stsClientMock.calls().length).to.eq(1);
					expect(timestreamWriteClientMock.calls().length).to.eq(2);

					return;
				}

				throw new Error('failed');
			});
		});
	});
});
