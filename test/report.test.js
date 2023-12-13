import { expect } from 'chai';
import fs from 'fs/promises';
import { getReport } from '../src/report.js';
import { createSandbox } from 'sinon';

const context = {
	githubOrganization: 'TestOrganization',
	githubRepository: 'test-repository',
	githubWorkflow: 'test-workflow.yml',
	githubRunId: 12345,
	githubRunAttempt: 1,
	gitBranch: 'test/branch',
	gitSha: '0000000000000000000000000000000000000000'
};
const inputs = {};
const reportPartial = {
	reportId: '00000000-0000-0000-0000-000000000000',
	reportVersion: 1,
	summary: {
		operatingSystem: 'linux',
		framework: 'mocha',
		started: 1702481047904,
		totalDuration: 23857,
		status: 'passed',
		countPassed: 2,
		countFailed: 0,
		countSkipped: 1,
		countFlaky: 1
	},
	details: [
		{
			name: 'test suite > flaky test',
			location: 'test/test-suite.js',
			started: 1702481047923,
			duration: 237,
			totalDuration: 549,
			status: 'passed',
			retries: 1
		},
		{
			name: 'test suite > passing test',
			location: 'test/test-suite.js',
			started: 1702481047945,
			duration: 237,
			totalDuration: 237,
			status: 'passed',
			retries: 0
		},
		{
			name: 'test suite > skipped test',
			location: 'test/test-suite.js',
			started: 1702481047956,
			duration: 0,
			totalDuration: 0,
			status: 'skipped',
			retries: 0
		}
	]
};
const reportFull = {
	reportId: '00000000-0000-0000-0000-000000000000',
	reportVersion: 1,
	summary: {
		lmsBuild: '20.24.01.12345',
		lmsInstance: 'https://cd2024112345.devlms.desire2learn.com/',
		operatingSystem: 'linux',
		framework: 'mocha',
		started: 1702481047904,
		totalDuration: 23857,
		status: 'passed',
		countPassed: 2,
		countFailed: 0,
		countSkipped: 1,
		countFlaky: 1
	},
	details: [
		{
			name: 'test suite > flaky test',
			location: 'test/test-suite.js',
			started: 1702481047923,
			duration: 237,
			totalDuration: 549,
			status: 'passed',
			retries: 1
		},
		{
			name: 'test suite > passing test',
			location: 'test/test-suite.js',
			started: 1702481047945,
			duration: 237,
			totalDuration: 237,
			status: 'passed',
			retries: 0
		},
		{
			name: 'test suite > skipped test',
			location: 'test/test-suite.js',
			started: 1702481047956,
			duration: 0,
			totalDuration: 0,
			status: 'skipped',
			retries: 0
		}
	]
};

describe('report', () => {
	let sandbox;

	before(() => sandbox = createSandbox());

	afterEach(() => sandbox.restore());

	const makeDummyLogger = () => ({
		startGroup: sandbox.stub(),
		endGroup: sandbox.stub(),
		info: sandbox.stub(),
		error: sandbox.stub()
	});

	describe('get report', () => {
		let logger;

		beforeEach(() => logger = makeDummyLogger());

		it('partial', async() => {
			sandbox.stub(fs, 'readFile').resolves(JSON.stringify(reportPartial));

			const report = await getReport(logger, context, inputs);
			const { reportId, reportVersion, summary } = report;

			expect(reportId).to.eq(reportPartial.reportId);
			expect(reportVersion).to.eq(reportPartial.reportVersion);
			expect(summary.githubOrganization).to.eq(context.githubOrganization);
			expect(summary.githubRepository).to.eq(context.githubRepository);
			expect(summary.githubWorkflow).to.eq(context.githubWorkflow);
			expect(summary.githubRunId).to.eq(context.githubRunId);
			expect(summary.githubRunAttempt).to.eq(context.githubRunAttempt);
			expect(summary.gitBranch).to.eq(context.gitBranch);
			expect(summary.gitSha).to.eq(context.gitSha);
		});

		it('full', async() => {
			sandbox.stub(fs, 'readFile').resolves(JSON.stringify(reportFull));

			const report = await getReport(logger, context, inputs);
			const { reportId, reportVersion, summary } = report;

			expect(reportId).to.eq(reportFull.reportId);
			expect(reportVersion).to.eq(reportFull.reportVersion);
			expect(summary.githubOrganization).to.eq(context.githubOrganization);
			expect(summary.githubRepository).to.eq(context.githubRepository);
			expect(summary.githubWorkflow).to.eq(context.githubWorkflow);
			expect(summary.githubRunId).to.eq(context.githubRunId);
			expect(summary.githubRunAttempt).to.eq(context.githubRunAttempt);
			expect(summary.gitBranch).to.eq(context.gitBranch);
			expect(summary.gitSha).to.eq(context.gitSha);
		});

		describe('fails', () => {
			it('file read', async() => {
				sandbox.stub(fs, 'readFile').throws();

				try {
					await getReport(logger, context, inputs);
				} catch (err) {
					expect(err.message).to.contain('Report is not valid');

					return;
				}

				throw new Error('failed');
			});

			it('not json', async() => {
				sandbox.stub(fs, 'readFile').resolves('this is not json');

				try {
					await getReport(logger, context, inputs);
				} catch (err) {
					expect(err.message).to.contain('Report is not valid');

					return;
				}

				throw new Error('failed');
			});

			it('validation', async() => {
				sandbox.stub(fs, 'readFile').resolves('{}');

				try {
					await getReport(logger, context, inputs);
				} catch (err) {
					expect(err.message).to.contain('Report does not conform to needed schema');

					return;
				}

				throw new Error('failed');
			});
		});
	});
});
