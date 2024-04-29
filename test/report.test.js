import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { finalize, submit } from '../src/report.js';
import { TimestreamWriteClient, WriteRecordsCommand } from '@aws-sdk/client-timestream-write';
import { createSandbox } from 'sinon';
import { expect } from 'chai';
import fs from 'fs';
import { mockClient } from 'aws-sdk-client-mock';
import { Report } from 'd2l-test-reporting/helpers/report.js';

const testContext = {
	github: {
		organization: 'TestOrganization',
		repository: 'test-repository',
		workflow: 'test-workflow.yml',
		runId: 12345,
		runAttempt: 1
	},
	git: {
		branch: 'test/branch',
		sha: '0000000000000000000000000000000000000000'
	}
};
const testOtherContext = {
	github: {
		organization: 'TestOrganizationOther',
		repository: 'test-repository-other',
		workflow: 'test-workflow-other.yml',
		runId: 67890,
		runAttempt: 2
	},
	git: {
		branch: 'test/branch/other',
		sha: '1111111111111111111111111111111111111111'
	}
};
const lmsInfo = {
	lmsBuildNumber: '20.24.1.12345',
	lmsInstanceUrl: 'https://cd2024112345.devlms.desire2learn.com'
};
const testInputsNoLmsInfo = {
	awsAccessKeyId: 'test-access-key-id',
	awsSecretAccessKey: 'test-secret-access-key',
	awsSessionToken: 'test-session-token',
	injectGitHubContext: 'auto',
	reportPath: './d2l-test-report.json',
	dryRun: false,
	debug: true
};
const testInputsFull = {
	...testInputsNoLmsInfo,
	...lmsInfo
};
const testInputsForceInject = {
	...testInputsNoLmsInfo,
	...lmsInfo,
	injectGitHubContext: 'force'
};
const testInputsDisableInject = {
	...testInputsNoLmsInfo,
	...lmsInfo,
	injectGitHubContext: 'off'
};
const testReportV1Minimal = {
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
const testReportV1NoLmsInfo = {
	reportId: testReportV1Minimal.reportId,
	reportVersion: testReportV1Minimal.reportVersion,
	summary: {
		...testReportV1Minimal.summary,
		githubOrganization: testContext.github.organization,
		githubRepository: testContext.github.repository,
		githubWorkflow: testContext.github.workflow,
		githubRunId: testContext.github.runId,
		githubRunAttempt: testContext.github.runAttempt,
		gitBranch: testContext.git.branch,
		gitSha: testContext.git.sha
	},
	details: testReportV1Minimal.details.map(detail => ({
		...detail,
		browser: 'chromium',
		type: 'unit',
		tool: 'Tool',
		experience: 'Experience'
	}))
};
const testReportV1Full = {
	...testReportV1NoLmsInfo,
	summary: {
		...testReportV1NoLmsInfo.summary,
		...lmsInfo
	},
	details: testReportV1NoLmsInfo.details.map(detail => ({
		...detail,
		browser: 'chromium',
		type: 'unit',
		tool: 'Tool',
		experience: 'Experience'
	}))
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
		it('minimal', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1Minimal));

			const report = await finalize(logger, testContext, testInputsFull);
			const { id, version, summary } = report.toJSON();

			expect(id).to.eq(testReportV1Minimal.reportId);
			expect(version).to.eq(2);
			expect(summary.github.organization).to.eq(testContext.github.organization);
			expect(summary.github.repository).to.eq(testContext.github.repository);
			expect(summary.github.workflow).to.eq(testContext.github.workflow);
			expect(summary.github.runId).to.eq(testContext.github.runId);
			expect(summary.github.runAttempt).to.eq(testContext.github.runAttempt);
			expect(summary.git.branch).to.eq(testContext.git.branch);
			expect(summary.git.sha).to.eq(testContext.git.sha);
			expect(summary.lms.buildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lms.instanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		it('no lms info', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

			const report = await finalize(logger, testContext, testInputsFull);
			const { id, version, summary } = report.toJSON();

			expect(id).to.eq(testReportV1NoLmsInfo.reportId);
			expect(version).to.eq(2);
			expect(summary.github.organization).to.eq(testContext.github.organization);
			expect(summary.github.repository).to.eq(testContext.github.repository);
			expect(summary.github.workflow).to.eq(testContext.github.workflow);
			expect(summary.github.runId).to.eq(testContext.github.runId);
			expect(summary.github.runAttempt).to.eq(testContext.github.runAttempt);
			expect(summary.git.branch).to.eq(testContext.git.branch);
			expect(summary.git.sha).to.eq(testContext.git.sha);
			expect(summary.lms.buildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lms.instanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		it('full', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1Full));

			const report = await finalize(logger, testContext, testInputsNoLmsInfo);
			const { id, version, summary } = report.toJSON();

			expect(id).to.eq(testReportV1Full.reportId);
			expect(version).to.eq(2);
			expect(summary.github.organization).to.eq(testContext.github.organization);
			expect(summary.github.repository).to.eq(testContext.github.repository);
			expect(summary.github.workflow).to.eq(testContext.github.workflow);
			expect(summary.github.runId).to.eq(testContext.github.runId);
			expect(summary.github.runAttempt).to.eq(testContext.github.runAttempt);
			expect(summary.git.branch).to.eq(testContext.git.branch);
			expect(summary.git.sha).to.eq(testContext.git.sha);
			expect(summary.lms.buildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lms.instanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		it('force inject context', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

			const report = await finalize(logger, testOtherContext, testInputsForceInject);
			const { id, version, summary } = report.toJSON();

			expect(id).to.eq(testReportV1NoLmsInfo.reportId);
			expect(version).to.eq(2);
			expect(summary.github.organization).to.eq(testOtherContext.github.organization);
			expect(summary.github.repository).to.eq(testOtherContext.github.repository);
			expect(summary.github.workflow).to.eq(testOtherContext.github.workflow);
			expect(summary.github.runId).to.eq(testOtherContext.github.runId);
			expect(summary.github.runAttempt).to.eq(testOtherContext.github.runAttempt);
			expect(summary.git.branch).to.eq(testOtherContext.git.branch);
			expect(summary.git.sha).to.eq(testOtherContext.git.sha);
			expect(summary.lms.buildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lms.instanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		it('disable inject context', async() => {
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

			const report = await finalize(logger, testOtherContext, testInputsDisableInject);
			const { id, version, summary } = report.toJSON();

			expect(id).to.eq(testReportV1NoLmsInfo.reportId);
			expect(version).to.eq(2);
			expect(summary.github.organization).to.eq(testContext.github.organization);
			expect(summary.github.repository).to.eq(testContext.github.repository);
			expect(summary.github.workflow).to.eq(testContext.github.workflow);
			expect(summary.github.runId).to.eq(testContext.github.runId);
			expect(summary.github.runAttempt).to.eq(testContext.github.runAttempt);
			expect(summary.git.branch).to.eq(testContext.git.branch);
			expect(summary.git.sha).to.eq(testContext.git.sha);
			expect(summary.lms.buildNumber).to.eq(lmsInfo.lmsBuildNumber);
			expect(summary.lms.instanceUrl).to.eq(lmsInfo.lmsInstanceUrl);
		});

		describe('fails', () => {
			it('file read', async() => {
				sandbox.stub(fs, 'readFileSync').throws();

				try {
					await finalize(logger, testContext, testInputsFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to read/parse report');

					return;
				}

				throw new Error('failed');
			});

			it('not json', async() => {
				sandbox.stub(fs, 'readFileSync').returns('this is not json');

				try {
					await finalize(logger, testContext, testInputsFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to read/parse report');

					return;
				}

				throw new Error('failed');
			});

			it('validation', async() => {
				sandbox.stub(fs, 'readFileSync').returns('{}');

				try {
					await finalize(logger, testContext, testInputsFull);
				} catch ({ message }) {
					expect(message).to.contain('Unable to determine report version');

					return;
				}

				throw new Error('failed');
			});

			describe('already present', () => {
				it('lms build number', async() => {
					const report = {
						...testReportV1NoLmsInfo,
						summary: {
							...testReportV1NoLmsInfo.summary,
							lmsBuildNumber: lmsInfo.lmsBuildNumber
						}
					};

					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(report));

					try {
						await finalize(logger, testContext, testInputsFull);
					} catch ({ message }) {
						expect(message).to.contain('LMS build number already present');

						return;
					}

					throw new Error('failed');
				});

				it('lms instance url', async() => {
					const report = {
						...testReportV1NoLmsInfo,
						summary: {
							...testReportV1NoLmsInfo.summary,
							lmsInstanceUrl: lmsInfo.lmsInstanceUrl
						}
					};

					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(report));

					try {
						await finalize(logger, testContext, testInputsFull);
					} catch ({ message }) {
						expect(message).to.contain('LMS instance URL already present');

						return;
					}

					throw new Error('failed');
				});
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
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1Full));

			const report = new Report('dummy-report-path');

			await submit(logger, testContext, testInputsFull, report);

			expect(stsClientMock.calls().length).to.eq(1);
			expect(timestreamWriteClientMock.calls().length).to.eq(2);
		});

		it('dry run', async() => {
			const dryRunInputs = {
				...testInputsFull,
				dryRun: true
			};

			stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1Full));

			const report = new Report('dummy-report-path');

			await submit(logger, testContext, dryRunInputs, report);

			expect(stsClientMock.calls().length).to.eq(1);
			expect(timestreamWriteClientMock.calls().length).to.eq(0);
		});

		it('debug', async() => {
			const debugInputs = {
				...testInputsFull,
				debug: true
			};

			stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
			timestreamWriteClientMock.on(WriteRecordsCommand).resolves();
			sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

			const report = new Report('dummy-report-path');

			await submit(logger, testContext, debugInputs, report);

			expect(stsClientMock.calls().length).to.eq(1);
			expect(timestreamWriteClientMock.calls().length).to.eq(2);
		});

		describe('fails', () => {
			describe('invalid credentials', () => {
				it('generic error', async() => {
					stsClientMock.on(AssumeRoleCommand).rejects(new Error('failed'));
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

					const report = new Report('dummy-report-path');

					try {
						await submit(logger, testContext, testInputsNoLmsInfo, report);
					} catch ({ message }) {
						expect(message).to.contain('Unable to assume required role');
						expect(message).to.not.contain('Possibly missing repo-settings set-up');
						expect(stsClientMock.calls().length).to.eq(1);
						expect(timestreamWriteClientMock.calls().length).to.eq(0);

						return;
					}

					throw new Error('failed');
				});

				it('permission error', async() => {
					stsClientMock.on(AssumeRoleCommand).rejects(new Error('User: is not authorized to perform'));
					sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

					const report = new Report('dummy-report-path');

					try {
						await submit(logger, testContext, testInputsNoLmsInfo, report);
					} catch ({ message }) {
						expect(message).to.contain('Unable to assume required role');
						expect(message).to.contain('Possibly missing repo-settings set-up');
						expect(stsClientMock.calls().length).to.eq(1);
						expect(timestreamWriteClientMock.calls().length).to.eq(0);

						return;
					}

					throw new Error('failed');
				});
			});

			it('sending write requests', async() => {
				stsClientMock.on(AssumeRoleCommand).resolves(testAwsStsCredentials);
				timestreamWriteClientMock
					.on(WriteRecordsCommand)
					.rejects(new Error('failed'));
				sandbox.stub(fs, 'readFileSync').returns(JSON.stringify(testReportV1NoLmsInfo));

				const report = new Report('dummy-report-path');

				try {
					await submit(logger, testContext, testInputsNoLmsInfo, report);
				} catch ({ message }) {
					expect(message).to.contain('Unable to submit write requests');
					expect(stsClientMock.calls().length).to.eq(1);
					expect(timestreamWriteClientMock.calls().length).to.eq(1);

					return;
				}

				throw new Error('failed');
			});
		});
	});
});
