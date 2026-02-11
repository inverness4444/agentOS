const unwrapData = (payload) => (payload && payload.data ? payload.data : payload);
const unwrapMeta = (payload) => (payload && payload.meta ? payload.meta : payload?.data?.meta || null);

module.exports = { unwrapData, unwrapMeta };
