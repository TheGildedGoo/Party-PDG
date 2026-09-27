export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("probe") === "1") {
    return Response.json({ saas: true, probe: true });
  }
  try {
    const actions = await import("../lib/actions/progress.js");
    return await actions.getProgress(request);
  } catch (err) {
    console.error(err);
    return Response.json({
      saas: true,
      error: "progress-load",
      message: String(err && (err.stack || err.message || err)).slice(0, 1500),
    }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const actions = await import("../lib/actions/progress.js");
    return await actions.putProgress(request);
  } catch (err) {
    console.error(err);
    return Response.json({
      saas: true,
      error: "progress-load",
      message: String(err && (err.stack || err.message || err)).slice(0, 1500),
    }, { status: 500 });
  }
}
