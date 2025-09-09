import { dirname, resolve } from 'node:path';
import { nodeConfig, setDirectoryConfigs } from 'eslint-config-brightspace';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import jsonPlugin from 'eslint-plugin-json';
import mochaPlugin from 'eslint-plugin-mocha';
import promisePlugin from 'eslint-plugin-promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const gitignorePath = resolve(__dirname, '.gitignore');
const ignoreConfigs = [
	includeIgnoreFile(gitignorePath),
	{ ignores: ['**/dist/'] }
];
const globalConfigs = [
	...nodeConfig,
	{
		linterOptions: {
			reportUnusedInlineConfigs: 'error',
			reportUnusedDisableDirectives: 'error'
		}
	},
	{
		rules: {
			'require-await': 'error',
			'key-spacing': ['error', { beforeColon: false, afterColon: true }],
			'object-shorthand': ['error', 'always'],
			'prefer-template': 'error',
			'@stylistic/comma-dangle': 'error',
			'@stylistic/template-curly-spacing': ['error', 'never']
		}
	},
	promisePlugin.configs['flat/recommended'],
	{
		rules: {
			'promise/prefer-await-to-then': ['error', { strict: true }]
		}
	}
];
const testConfigs = [
	...globalConfigs,
	mochaPlugin.configs.recommended,
	{
		rules: {
			'mocha/no-exclusive-tests': 'error',
			'mocha/no-mocha-arrows': 'off'
		}
	}
];
const jsonConfig = jsonPlugin.configs['recommended'];

export default [
	...ignoreConfigs,
	...setDirectoryConfigs(
		globalConfigs,
		{
			'test/': testConfigs
		}
	),
	jsonConfig
];
