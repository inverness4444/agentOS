const { NextResponse } = require("next/server");
const { noStoreHeaders } = require("./guard.js");

const jsonNoStore = (payload, init = {}) =>
  NextResponse.json(payload, {
    ...init,
    headers: {
      ...noStoreHeaders,
      ...(init.headers || {})
    }
  });

const jsonGuardError = (guardResult) =>
  jsonNoStore(
    {
      error: guardResult?.message || guardResult?.code || "Forbidden",
      code: guardResult?.code || "FORBIDDEN"
    },
    { status: guardResult?.status || 403 }
  );

module.exports = {
  jsonNoStore,
  jsonGuardError
};
