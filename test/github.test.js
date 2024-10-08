import { getContext, getInputs, makeLogger } from '../src/github.js';
import { createSandbox } from 'sinon';
import { expect } from 'chai';
import fs from 'fs/promises';
import { resolve } from 'path';

const captureOutput = () => {
	let output = '';
	const oldWrite = process.stdout.write;

	process.stdout.write = (chunk) => {
		output += chunk.toString();
	};

	return {
		unhook: () => process.stdout.write = oldWrite,
		captured: () => output
	};
};

describe('github', () => {
	let sandbox;

	before(() => sandbox = createSandbox());

	afterEach(() => sandbox.restore());

	const makeDummyLogger = () => ({
		startGroup: sandbox.stub(),
		endGroup: sandbox.stub(),
		info: sandbox.stub(),
		warning: sandbox.stub(),
		error: sandbox.stub()
	});

	it('logger logs', () => {
		const output = captureOutput();
		const logger = makeLogger();

		logger.startGroup('Group test');
		logger.info('Info test');
		logger.error('Error test');
		logger.endGroup();

		output.unhook();

		const outputLines = output.captured().split(/\r?\n/);
		const expectedOutputLines = [
			'::group::Group test',
			'Info test',
			'::error::Error test',
			'::endgroup::'
		];

		for (const i in expectedOutputLines) {
			expect(expectedOutputLines[i]).to.deep.eq(outputLines[i]);
		}
	});

	describe('get context', () => {
		const expectedResult = {
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
		const expectedInfoLines = [
			'GitHub organization: TestOrganization',
			'GitHub repository: test-repository',
			'GitHub workflow: test-workflow.yml',
			'GitHub run ID: 12345',
			'GitHub run attempt: 1',
			'Git branch: test/branch',
			'Git SHA: 0000000000000000000000000000000000000000'
		];
		let logger;

		beforeEach(() => {
			logger = makeDummyLogger();
		});

		describe('in github actions', () => {
			it('pull request', () => {
				sandbox.stub(process, 'env').value({
					'GITHUB_ACTIONS': '1',
					'GITHUB_HEAD_REF': 'refs/heads/test/branch',
					'GITHUB_REF': 'refs/heads/test/branch',
					'GITHUB_REPOSITORY': 'TestOrganization/test-repository',
					'GITHUB_RUN_ATTEMPT': '1',
					'GITHUB_RUN_ID': '12345',
					'GITHUB_SHA': '0000000000000000000000000000000000000000',
					'GITHUB_WORKFLOW_REF': 'TestOrganization/test-repository/.github/workflows/test-workflow.yml@test/branch'
				});

				const context = getContext(logger);

				expect(expectedResult).to.deep.eq(context);
				expect(logger.startGroup.calledOnce).to.be.true;
				expect(logger.endGroup.calledOnce).to.be.true;
				expect(logger.info.callCount).to.eq(7);
				expect(logger.error.notCalled).to.be.true;
				expect(logger.startGroup.calledWith('Gather GitHub context')).to.be.true;

				for (const i in expectedInfoLines) {
					expect(logger.info.calledWith(expectedInfoLines[i])).to.be.true;
				}
			});

			it('branch', () => {
				sandbox.stub(process, 'env').value({
					'GITHUB_ACTIONS': '1',
					'GITHUB_REF': 'refs/heads/test/branch',
					'GITHUB_REPOSITORY': 'TestOrganization/test-repository',
					'GITHUB_RUN_ATTEMPT': '1',
					'GITHUB_RUN_ID': '12345',
					'GITHUB_SHA': '0000000000000000000000000000000000000000',
					'GITHUB_WORKFLOW_REF': 'TestOrganization/test-repository/.github/workflows/test-workflow.yml@test/branch'
				});

				const context = getContext(logger);

				expect(expectedResult).to.deep.eq(context);
				expect(logger.startGroup.calledOnce).to.be.true;
				expect(logger.endGroup.calledOnce).to.be.true;
				expect(logger.info.callCount).to.eq(7);
				expect(logger.error.notCalled).to.be.true;
				expect(logger.startGroup.calledWith('Gather GitHub context')).to.be.true;

				for (const i in expectedInfoLines) {
					expect(logger.info.calledWith(expectedInfoLines[i])).to.be.true;
				}
			});
		});

		it('not in github actions', () => {
			sandbox.stub(process, 'env').value({});

			const logger = makeDummyLogger();
			const wrapper = () => getContext(logger);

			expect(wrapper).to.throw('Unable to gather github context');
		});
	});

	describe('get inputs', () => {
		it('all parameters included', async() => {
			const logger = makeDummyLogger();

			sandbox.stub(fs, 'access');
			sandbox.stub(process, 'env').value({
				'INPUT_AWS-ACCESS-KEY-ID': 'aws-access-key-id',
				'INPUT_AWS-SECRET-ACCESS-KEY': 'aws-secret-access-key',
				'INPUT_AWS-SESSION-TOKEN': 'aws-session-token',
				'INPUT_ROLE-TO-ASSUME': 'role-to-assume',
				'INPUT_REPORT-PATH': './test/data/d2l-test-report.json',
				'INPUT_LMS-BUILD-NUMBER': '20.24.1.12345',
				'INPUT_LMS-INSTANCE-URL': 'https://cd2024112345.devlms.desire2learn.com',
				'INPUT_INJECT-GITHUB-CONTEXT': 'auto',
				'INPUT_POST-SUMMARY': 'true',
				'INPUT_DRY-RUN': 'true',
				'INPUT_DEBUG': 'true'
			});

			const inputs = await getInputs(logger);

			expect(inputs.awsAccessKeyId).to.eq('aws-access-key-id');
			expect(inputs.awsSecretAccessKey).to.eq('aws-secret-access-key');
			expect(inputs.awsSessionToken).to.eq('aws-session-token');

			const path = resolve('./test/data/d2l-test-report.json');

			expect(inputs.reportPath).to.eq(path);
			expect(inputs.lmsBuildNumber).to.eq('20.24.1.12345');
			expect(inputs.lmsInstanceUrl).to.eq('https://cd2024112345.devlms.desire2learn.com');
			expect(inputs.injectGitHubContext).to.eq('auto');
			expect(inputs.dryRun).to.be.true;
			expect(inputs.debug).to.be.true;
		});

		it('optionals not included', async() => {
			const logger = makeDummyLogger();

			sandbox.stub(fs, 'access');
			sandbox.stub(process, 'env').value({
				'INPUT_AWS-ACCESS-KEY-ID': 'aws-access-key-id',
				'INPUT_AWS-SECRET-ACCESS-KEY': 'aws-secret-access-key',
				'INPUT_AWS-SESSION-TOKEN': 'aws-session-token',
				'INPUT_ROLE-TO-ASSUME': 'role-to-assume',
				'INPUT_REPORT-PATH': './test/data/d2l-test-report.json',
				'INPUT_INJECT-GITHUB-CONTEXT': 'auto',
				'INPUT_POST-SUMMARY': 'true',
				'INPUT_DRY-RUN': 'true',
				'INPUT_DEBUG': 'true'
			});

			const inputs = await getInputs(logger);

			expect(inputs.awsAccessKeyId).to.eq('aws-access-key-id');
			expect(inputs.awsSecretAccessKey).to.eq('aws-secret-access-key');
			expect(inputs.awsSessionToken).to.eq('aws-session-token');

			const path = resolve('./test/data/d2l-test-report.json');

			expect(inputs.reportPath).to.eq(path);
			expect(inputs.lmsBuildNumber).to.not.exist;
			expect(inputs.lmsInstanceUrl).to.not.exist;
			expect(inputs.injectGitHubContext).to.eq('auto');
			expect(inputs.dryRun).to.be.true;
			expect(inputs.debug).to.be.true;
		});

		it('empty input', async() => {
			sandbox.stub(process, 'env').value({
				'INPUT_AWS-ACCESS-KEY-ID': ' ',
				'INPUT_AWS-SECRET-ACCESS-KEY': 'aws-secret-access-key',
				'INPUT_AWS-SESSION-TOKEN': 'aws-session-token',
				'INPUT_ROLE-TO-ASSUME': 'role-to-assume',
				'INPUT_REPORT-PATH': './test/data/d2l-test-report.json',
				'INPUT_INJECT-GITHUB-CONTEXT': 'auto',
				'INPUT_POST-SUMMARY': 'true',
				'INPUT_DRY-RUN': 'true',
				'INPUT_DEBUG': 'true'
			});

			try {
				const logger = makeDummyLogger();

				await getInputs(logger);
			} catch ({ message }) {
				expect(message).to.contain('must be a non-empty string');

				return;
			}

			throw new Error('failed');
		});

		it('non-existent report path', async() => {
			sandbox.stub(process, 'env').value({
				'INPUT_AWS-ACCESS-KEY-ID': 'aws-access-key-id',
				'INPUT_AWS-SECRET-ACCESS-KEY': 'aws-secret-access-key',
				'INPUT_AWS-SESSION-TOKEN': 'aws-session-token',
				'INPUT_ROLE-TO-ASSUME': 'role-to-assume',
				'INPUT_REPORT-PATH': 'not a file',
				'INPUT_INJECT-GITHUB-CONTEXT': 'auto',
				'INPUT_POST-SUMMARY': 'true',
				'INPUT_DRY-RUN': 'true',
				'INPUT_DEBUG': 'true'
			});

			try {
				const logger = makeDummyLogger();

				await getInputs(logger);
			} catch ({ message }) {
				expect(message).to.eq('Report path must exists');

				return;
			}

			throw new Error('failed');
		});

		it('invalid injection mode', async() => {
			sandbox.stub(fs, 'access');
			sandbox.stub(process, 'env').value({
				'INPUT_AWS-ACCESS-KEY-ID': 'aws-access-key-id',
				'INPUT_AWS-SECRET-ACCESS-KEY': 'aws-secret-access-key',
				'INPUT_AWS-SESSION-TOKEN': 'aws-session-token',
				'INPUT_ROLE-TO-ASSUME': 'role-to-assume',
				'INPUT_REPORT-PATH': './test/data/d2l-test-report.json',
				'INPUT_INJECT-GITHUB-CONTEXT': 'bad',
				'INPUT_POST-SUMMARY': 'true',
				'INPUT_DRY-RUN': 'true',
				'INPUT_DEBUG': 'true'
			});

			try {
				const logger = makeDummyLogger();

				await getInputs(logger);
			} catch ({ message }) {
				expect(message).to.eq('Inject context mode invalid');

				return;
			}

			throw new Error('failed');
		});
	});
});
