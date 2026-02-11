const createLimiter = (concurrency = 2) => {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= concurrency) return;
    const item = queue.shift();
    if (!item) return;
    active += 1;
    const run = async () => {
      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      } finally {
        active -= 1;
        next();
      }
    };
    run();
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
};

module.exports = { createLimiter };
