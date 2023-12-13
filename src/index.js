import { getContext, getInputs, makeLogger, setFailed } from './github.js';

(async() => {
	const logger = makeLogger();

	try {
		getContext(logger);
		await getInputs(logger);
	} catch (err) {
		logger.endGroup();

		setFailed(err.message);
	}
})();
