const delay = () => {
	return new Promise(resolve => setTimeout(resolve, 1000));
};

describe('reporter', () => {
	let count = 0;

	it.skip('skipped test', () => {});

	it('flaky test', async() => {
		if (count < 2) {
			await delay();

			count++;

			throw new Error('flaky test failure');
		}
	});
});
