import { dirname, resolve } from 'node:path';
import { nodeConfig, setDirectoryConfigs } from 'eslint-config-brightspace';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import jsonPlugin from 'eslint-plugin-json';
import mochaPlugin from 'eslint-plugin-mocha';

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
		rules: {
			'comma-dangle': 'error'
		}
	}
];
const testConfigs = [
	...globalConfigs,
	mochaPlugin.configs.flat.recommended,
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
