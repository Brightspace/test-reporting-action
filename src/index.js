import { getContext, getInputs, makeLogger, setFailed } from './github.js';
import { getReport } from './report.js';

(async() => {
	const logger = makeLogger();

	try {
		const context = getContext(logger);
		const inputs = await getInputs(logger);

		await getReport(logger, context, inputs);
	} catch (err) {
		setFailed(err.message);

		logger.endGroup();
	}
})();
