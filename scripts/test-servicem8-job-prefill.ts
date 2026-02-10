import { handler as servicem8Handler } from "../netlify/functions/servicem8JobPrefill";

function makeEvent(overrides: Partial<Parameters<typeof servicem8Handler>[0]> = {}) {
  return {
    httpMethod: "GET",
    headers: {},
    queryStringParameters: {},
    path: "/api/servicem8/job-prefill",
    ...overrides,
  } as any;
}

async function testValidation() {
  const res = await servicem8Handler(
    makeEvent({
      queryStringParameters: { job_number: "" },
    }),
    {} as any
  );
  console.log("[test] validation status", res.statusCode, "body", res.body);
  if (res.statusCode !== 400) {
    throw new Error("Expected 400 for missing job_number");
  }
}

async function run() {
  await testValidation();
  console.log("✅ servicem8 job prefill basic tests passed");
}

run().catch((e) => {
  console.error("❌ servicem8 job prefill tests failed", e);
  process.exit(1);
});

